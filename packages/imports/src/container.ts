import { inflateRawSync } from 'node:zlib';
import { ImportFileError } from './errors.js';

/**
 * Structural checks of an .xlsx file BEFORE any spreadsheet library parses it.
 *
 * An .xlsx file is a ZIP archive. These checks reject, cheaply and safely:
 * - files that are not ZIP archives (wrong type renamed to .xlsx, legacy .xls, password-protected
 *   workbooks — which are OLE compound files);
 * - archives without the parts every workbook has;
 * - ZIP64, encrypted or unusually compressed entries;
 * - "zip bombs": the total declared uncompressed size is capped, and `verifyXlsxContainer`
 *   additionally inflates every entry with a hard output cap, so a lying size field cannot be used
 *   to exhaust memory later.
 *
 * Nothing is ever extracted to disk, so entry names cannot cause path traversal.
 */
export interface ContainerLimits {
  maxUncompressedBytes: number;
  maxEntries?: number;
}

export interface ContainerEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];
const DEFAULT_MAX_ENTRIES = 5_000;

const NOT_XLSX =
  'This file is not a valid .xlsx workbook. Save it from Excel as "Excel Workbook (.xlsx)".';

export function inspectXlsxContainer(bytes: Uint8Array, limits: ContainerLimits): ContainerEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength >= 4 && OLE_SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw new ImportFileError(
      'UNSUPPORTED_WORKBOOK',
      'This workbook is password-protected or in the old .xls format. Remove the password and save it as "Excel Workbook (.xlsx)".',
    );
  }
  if (bytes.byteLength < 22 || view.getUint32(0, true) !== LOCAL_SIGNATURE) {
    throw new ImportFileError('NOT_XLSX', NOT_XLSX);
  }

  // End of central directory: last 22 bytes + up to 65,535 bytes of comment.
  let eocd = -1;
  for (
    let offset = bytes.byteLength - 22;
    offset >= Math.max(0, bytes.byteLength - 65_557);
    offset--
  ) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new ImportFileError('NOT_XLSX', NOT_XLSX);

  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    throw new ImportFileError(
      'UNSUPPORTED_WORKBOOK',
      'This workbook uses an unsupported (ZIP64) format.',
    );
  }
  if (entryCount > (limits.maxEntries ?? DEFAULT_MAX_ENTRIES)) {
    throw new ImportFileError(
      'WORKBOOK_TOO_COMPLEX',
      'This workbook contains too many internal parts.',
    );
  }
  if (directoryOffset + directorySize > eocd) throw new ImportFileError('NOT_XLSX', NOT_XLSX);

  const entries: ContainerEntry[] = [];
  let total = 0;
  let offset = directoryOffset;
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ImportFileError('NOT_XLSX', NOT_XLSX);
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (flags & 0x1) {
      throw new ImportFileError('UNSUPPORTED_WORKBOOK', 'Encrypted workbooks are not supported.');
    }
    if (method !== 0 && method !== 8) {
      throw new ImportFileError(
        'UNSUPPORTED_WORKBOOK',
        'This workbook uses an unsupported compression method.',
      );
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new ImportFileError(
        'UNSUPPORTED_WORKBOOK',
        'This workbook uses an unsupported (ZIP64) format.',
      );
    }
    total += uncompressedSize;
    if (total > limits.maxUncompressedBytes) {
      throw new ImportFileError(
        'WORKBOOK_TOO_LARGE',
        'This workbook expands to more data than the import limit allows. Split it into smaller files.',
      );
    }
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) {
    throw new ImportFileError('NOT_XLSX', NOT_XLSX);
  }
  return entries;
}

/**
 * `inspectXlsxContainer` plus an actual decompression of every entry with a hard output cap, proving
 * the declared sizes are true before a spreadsheet library inflates the archive. Used by the worker.
 */
export function verifyXlsxContainer(bytes: Uint8Array, limits: ContainerLimits): void {
  const entries = inspectXlsxContainer(bytes, limits);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const entry of entries) {
    const header = entry.localHeaderOffset;
    if (header + 30 > bytes.byteLength || view.getUint32(header, true) !== LOCAL_SIGNATURE) {
      throw new ImportFileError('NOT_XLSX', NOT_XLSX);
    }
    const start =
      header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
    const end = start + entry.compressedSize;
    if (end > bytes.byteLength) throw new ImportFileError('NOT_XLSX', NOT_XLSX);
    const data = bytes.subarray(start, end);
    let size: number;
    if (entry.method === 0) {
      size = data.byteLength;
    } else {
      try {
        size = inflateRawSync(data, {
          maxOutputLength: Math.max(1, entry.uncompressedSize),
        }).byteLength;
      } catch {
        throw new ImportFileError('NOT_XLSX', NOT_XLSX);
      }
    }
    if (size !== entry.uncompressedSize) throw new ImportFileError('NOT_XLSX', NOT_XLSX);
  }
}
