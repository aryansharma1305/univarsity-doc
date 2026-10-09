import { deflateSync } from 'node:zlib';
import sharp from 'sharp';

/** A minimal, synthetic, static one-page PDF (no real certificate content). */
export function staticPdf(extraObject = '', marker = 'SYNTHETIC'): Buffer {
  return Buffer.from(
    [
      '%PDF-1.4',
      `% ${marker}`,
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj',
      extraObject,
      'trailer << /Root 1 0 R >>',
      '%%EOF',
      '',
    ].join('\n'),
    'latin1',
  );
}

/** A PDF whose /JavaScript action is hidden inside a Flate-compressed object stream. */
export function pdfWithCompressedScript(): Buffer {
  const hidden = deflateSync(Buffer.from('<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>'));
  const head = Buffer.from(
    `%PDF-1.5\n4 0 obj << /Type /ObjStm /Filter /FlateDecode /Length ${String(hidden.length)} >>\nstream\n`,
    'latin1',
  );
  const tail = Buffer.from('\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
  return Buffer.concat([head, hidden, tail]);
}

export const scans = {
  png: (width = 800, height = 1100) =>
    sharp({ create: { width, height, channels: 3, background: '#f5f1e6' } })
      .png()
      .toBuffer(),
  jpeg: (width = 800, height = 1100) =>
    sharp({ create: { width, height, channels: 3, background: '#efe9d8' } })
      .jpeg()
      .toBuffer(),
};
