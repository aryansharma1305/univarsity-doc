import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/app-error.js';
import { inspectDocument, sniffContentType } from '../../src/historical-documents/document-file.js';
import { pdfWithCompressedScript, scans, staticPdf } from './support.js';

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.message;
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('historical document file inspection', () => {
  it('accepts static PDFs and decodable JPEG/PNG scans, by content', async () => {
    await expect(inspectDocument(staticPdf(), 'application/pdf')).resolves.toEqual({
      contentType: 'application/pdf',
      extension: 'pdf',
    });
    await expect(inspectDocument(await scans.png(), 'image/png')).resolves.toMatchObject({
      extension: 'png',
    });
    await expect(inspectDocument(await scans.jpeg(), 'IMAGE/JPEG')).resolves.toMatchObject({
      extension: 'jpg',
    });
    expect(sniffContentType(Buffer.from('GIF89a'))).toBeUndefined();
  });

  it.each([
    ['inline JavaScript', staticPdf('5 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj')],
    ['a hex-escaped /J#61vaScript name', staticPdf('5 0 obj << /S /J#61vaScript >> endobj')],
    ['a launch action', staticPdf('5 0 obj << /S /Launch /F (cmd.exe) >> endobj')],
    ['an embedded file', staticPdf('5 0 obj << /EmbeddedFiles 6 0 R >> endobj')],
    ['an XFA form', staticPdf('5 0 obj << /XFA 7 0 R >> endobj')],
    ['a script hidden in a compressed object stream', pdfWithCompressedScript()],
  ])('rejects a PDF with %s', async (_name, bytes) => {
    expect(await rejection(inspectDocument(bytes, 'application/pdf'))).toMatch(/active content/);
  });

  it('rejects encrypted and truncated PDFs', async () => {
    expect(
      await rejection(
        inspectDocument(staticPdf('5 0 obj << /Encrypt 8 0 R >> endobj'), 'application/pdf'),
      ),
    ).toMatch(/Encrypted/);
    const truncated = staticPdf().subarray(0, 60);
    expect(await rejection(inspectDocument(truncated, 'application/pdf'))).toMatch(/incomplete/);
  });

  it('rejects mismatched, unsupported, tiny and corrupt files', async () => {
    expect(await rejection(inspectDocument(staticPdf(), 'image/png'))).toMatch(/does not match/);
    expect(await rejection(inspectDocument(await scans.png(), 'application/pdf'))).toMatch(
      /does not match/,
    );
    expect(await rejection(inspectDocument(Buffer.from('<svg/>'), 'image/svg+xml'))).toMatch(
      /PDF, JPEG or PNG/,
    );
    expect(await rejection(inspectDocument(Buffer.from('MZ\x90\x00'), 'application/pdf'))).toMatch(
      /not a PDF/,
    );
    expect(await rejection(inspectDocument(await scans.png(200, 200), 'image/png'))).toMatch(
      /too small/,
    );
    const jpeg = await scans.jpeg();
    expect(await rejection(inspectDocument(jpeg.subarray(0, 400), 'image/jpeg'))).toMatch(
      /could not be read/,
    );
  });
});
