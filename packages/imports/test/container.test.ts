import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inspectXlsxContainer, verifyXlsxContainer } from '../src/index.js';
import { buildWorkbook } from '../src/testing.js';

const LIMITS = { maxUncompressedBytes: 50 * 1024 * 1024 };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

/** A minimal ZIP with the given (stored or deflated) entries. */
function zip(entries: { name: string; data: Uint8Array; declaredSize?: number }[]): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = deflateRawSync(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.declaredSize ?? entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, compressed);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(entry.declaredSize ?? entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += 30 + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

const WORKBOOK_PARTS = [
  { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
  { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
];

describe('xlsx container checks', () => {
  it('accepts a real workbook', async () => {
    const bytes = await buildWorkbook([{ name: 'Students', rows: [['A'], ['1']] }]);
    expect(() => {
      verifyXlsxContainer(bytes, LIMITS);
    }).not.toThrow();
  });

  it('rejects files that are not ZIP archives (wrong type renamed to .xlsx)', () => {
    expect(
      codeOf(() => inspectXlsxContainer(new TextEncoder().encode('name,reg\nA,1'), LIMITS)),
    ).toBe('NOT_XLSX');
    expect(
      codeOf(() => inspectXlsxContainer(new Uint8Array([0x25, 0x50, 0x44, 0x46]), LIMITS)),
    ).toBe('NOT_XLSX');
  });

  it('recognises legacy .xls / password-protected (OLE) files', () => {
    const ole = new Uint8Array(512);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(codeOf(() => inspectXlsxContainer(ole, LIMITS))).toBe('UNSUPPORTED_WORKBOOK');
  });

  it('rejects ZIP archives that are not workbooks', () => {
    const bytes = zip([{ name: 'readme.txt', data: Buffer.from('hello') }]);
    expect(codeOf(() => inspectXlsxContainer(bytes, LIMITS))).toBe('NOT_XLSX');
  });

  it('rejects archives that expand beyond the limit (zip-bomb guard)', () => {
    const bytes = zip([
      ...WORKBOOK_PARTS,
      { name: 'xl/worksheets/sheet1.xml', data: new Uint8Array(200_000) },
    ]);
    expect(codeOf(() => inspectXlsxContainer(bytes, { maxUncompressedBytes: 100_000 }))).toBe(
      'WORKBOOK_TOO_LARGE',
    );
  });

  it('detects entries whose declared size lies about the real (inflated) size', () => {
    const bytes = zip([
      ...WORKBOOK_PARTS,
      { name: 'xl/worksheets/sheet1.xml', data: new Uint8Array(500_000), declaredSize: 1_000 },
    ]);
    expect(() => inspectXlsxContainer(bytes, LIMITS)).not.toThrow();
    expect(
      codeOf(() => {
        verifyXlsxContainer(bytes, LIMITS);
      }),
    ).toBe('NOT_XLSX');
  });

  it('rejects truncated archives', async () => {
    const bytes = await buildWorkbook([{ name: 'Students', rows: [['A']] }]);
    expect(codeOf(() => inspectXlsxContainer(bytes.subarray(0, bytes.length - 30), LIMITS))).toBe(
      'NOT_XLSX',
    );
  });
});
