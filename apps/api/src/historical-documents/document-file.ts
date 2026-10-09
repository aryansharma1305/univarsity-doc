import { HttpStatus } from '@nestjs/common';
import { inflateSync } from 'node:zlib';
import { ERROR_CODES, HISTORICAL_DOCUMENT_RULES } from '@docversity/validation';
import sharp from 'sharp';
import { AppError } from '../common/app-error.js';

export type DocumentContentType = (typeof HISTORICAL_DOCUMENT_RULES.acceptedTypes)[number];

/** Limits for one kind of upload (historical documents by default; payment files in Phase 9C). */
export interface InspectionRules {
  acceptedTypes: readonly string[];
  maxImagePixels: number;
  minImageSide: number;
}

export interface InspectedDocument {
  contentType: DocumentContentType;
  extension: 'pdf' | 'jpg' | 'png';
}

function invalid(message: string): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.unsupportedFile, message, {
    details: [{ path: 'file', message }],
  });
}

/** The format from the file's own signature (never from its name or declared type). */
export function sniffContentType(bytes: Uint8Array): DocumentContentType | undefined {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  return undefined;
}

/**
 * PDF names that introduce active or external content. Documents carrying any of them are refused:
 * a historical certificate is a static scan or print, never an interactive document.
 */
const FORBIDDEN_PDF_NAMES = new Set([
  'JavaScript',
  'JS',
  'Launch',
  'EmbeddedFile',
  'EmbeddedFiles',
  'RichMedia',
  'XFA',
  'SubmitForm',
  'ImportData',
  'GoToE',
  'Sound',
  'Movie',
]);

/** Upper bound for inflating compressed streams while scanning (zip-bomb guard). */
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

/** Names in PDF syntax (`/Name`, with `#xx` escapes decoded so `/J#61vaScript` is still found). */
function pdfNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\/([^\s/<>[\]()%{}]+)/g)) {
    const raw = match[1] ?? '';
    names.push(
      raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    );
  }
  return names;
}

/**
 * Scans a PDF's object syntax AND its Flate-compressed streams (object streams can hide
 * dictionaries) for encryption and active content. Throws on anything it cannot vouch for.
 */
export function assertStaticPdf(bytes: Uint8Array): void {
  const text = Buffer.from(bytes).toString('latin1');
  if (!text.slice(-2048).includes('%%EOF')) {
    throw invalid('The PDF is incomplete or damaged. Upload the complete file.');
  }
  const segments = [text];
  let inflated = 0;
  for (const match of text.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    try {
      const chunk = inflateSync(Buffer.from(text.slice(start, end), 'latin1'), {
        maxOutputLength: MAX_INFLATED_BYTES - inflated,
      });
      inflated += chunk.length;
      segments.push(chunk.toString('latin1'));
    } catch (error) {
      // Not Flate data (e.g. a JPEG image stream) — fine. Hitting the budget is not.
      if (
        error instanceof RangeError ||
        (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
      ) {
        throw invalid('The PDF is too complex to check. Upload a simpler scan or print.');
      }
    }
    if (inflated >= MAX_INFLATED_BYTES) {
      throw invalid('The PDF is too complex to check. Upload a simpler scan or print.');
    }
  }
  for (const segment of segments) {
    for (const name of pdfNames(segment)) {
      if (name === 'Encrypt') {
        throw invalid('Encrypted or password-protected PDFs are not accepted.');
      }
      if (FORBIDDEN_PDF_NAMES.has(name)) {
        throw invalid(
          'This PDF contains active content (scripts, attachments, forms or media). Upload a plain scan or print of the document.',
        );
      }
    }
  }
}

/**
 * Validates an uploaded historical document by its CONTENT. Images are fully decoded (with a pixel
 * budget) and must be a single still image of a sensible size; PDFs must be static. The original
 * bytes are stored unchanged (evidence fidelity), so their SHA-256 identifies the file as received.
 */
export async function inspectDocument(
  bytes: Uint8Array,
  declaredType: string,
  rules: InspectionRules = HISTORICAL_DOCUMENT_RULES,
): Promise<InspectedDocument> {
  const accepted: readonly string[] = rules.acceptedTypes;
  if (!accepted.includes(declaredType.toLowerCase())) {
    throw invalid('Upload a PDF, JPEG or PNG file.');
  }
  const contentType = sniffContentType(bytes);
  if (!contentType) throw invalid('The file is not a PDF, JPEG or PNG document.');
  if (contentType !== declaredType.toLowerCase()) {
    throw invalid(
      'The file content does not match its type. Upload the original PDF, JPEG or PNG.',
    );
  }
  if (contentType === 'application/pdf') {
    assertStaticPdf(bytes);
    return { contentType, extension: 'pdf' };
  }
  try {
    const image = sharp(bytes, {
      limitInputPixels: rules.maxImagePixels,
      failOn: 'error',
    });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) throw invalid('Animated or multi-page images are not accepted.');
    const { width, height } = metadata.autoOrient;
    if (Math.min(width, height) < rules.minImageSide) {
      throw invalid(
        `The scan is too small to read. Use at least ${String(rules.minImageSide)} pixels on each side.`,
      );
    }
    // Decode every pixel once: truncated or corrupt images fail here.
    await image.raw().toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalid('The image could not be read. Upload a complete JPEG or PNG scan.');
  }
  return { contentType, extension: contentType === 'image/png' ? 'png' : 'jpg' };
}
