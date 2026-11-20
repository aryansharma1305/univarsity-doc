import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/app-error.js';
import { processStudentUpload } from '../../src/student-uploads/student-upload-file.js';
import {
  EMBEDDED,
  jpegWithEmbeddedMetadata,
  pdfWithCompressedScript,
  scans,
  staticPdf,
} from '../historical-documents/support.js';

const u8 = (buffer: Buffer) => new Uint8Array(buffer);

describe('student upload processing (no services)', () => {
  it('keeps a static PDF as uploaded, with its SHA-256', async () => {
    const pdf = staticPdf();
    const result = await processStudentUpload(u8(pdf), 'application/pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.extension).toBe('pdf');
    expect(Buffer.from(result.bytes).equals(pdf)).toBe(true);
    expect(result.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
  });

  it('re-encodes images and strips every embedded metadata value', async () => {
    const result = await processStudentUpload(u8(await jpegWithEmbeddedMetadata()), 'image/jpeg');
    expect(result.contentType).toBe('image/jpeg');
    const bytes = Buffer.from(result.bytes);
    for (const value of Object.values(EMBEDDED)) expect(bytes.includes(value)).toBe(false);
    const metadata = await sharp(bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    const png = await processStudentUpload(u8(await scans.png()), 'image/png');
    expect(png.extension).toBe('png');
  });

  it.each([
    ['active PDF content', () => pdfWithCompressedScript(), 'application/pdf'],
    ['a declared type that does not match the content', () => staticPdf(), 'image/png'],
    ['an unsupported type', () => Buffer.from('<svg/>'), 'image/svg+xml'],
    ['text claiming to be a JPEG', () => Buffer.from('not an image'), 'image/jpeg'],
  ])('refuses %s', async (_name, make, type) => {
    await expect(processStudentUpload(u8(make()), type)).rejects.toBeInstanceOf(AppError);
  });
});
