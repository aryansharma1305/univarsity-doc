import { crc32, deflateSync } from 'node:zlib';
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

/**
 * Synthetic identifying values embedded in test scans. None of them may appear in a student copy.
 * (All invented; no real person, device or place.)
 */
export const EMBEDDED = {
  make: 'SynthCam',
  model: 'Model-X9',
  serial: 'SN-SYNTH-0042',
  operator: 'Scanner Operator Q',
  description: 'Synthetic scanner note',
  copyright: 'Synthetic Copyright Holder',
  xmpCreator: 'Synthetic XMP Creator',
  iptcCity: 'Synthetic City',
  iptcByline: 'Synthetic Photographer',
  comment: 'COMMENT-SYNTH-7',
  pngAuthor: 'Synthetic PNG Author',
} as const;

const u16 = (value: number) => Buffer.from([value >> 8, value & 0xff]);
const u32 = (value: number) => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
};

/** A synthetic certificate page: white, a dark marker block at the top-left, large printed text. */
export async function certificatePage(width = 900, height = 1200): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="0" y="0" width="120" height="120" fill="#101828"/>
    <text x="80" y="400" font-family="sans-serif" font-size="56" fill="#000">SYNTHETIC CERTIFICATE</text>
    <text x="80" y="520" font-family="sans-serif" font-size="56" fill="#000">No. ACC/CERT/1001</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** An IPTC (APP13) segment with a city and a by-line, as written by photo/scan software. */
function iptcSegment(): Buffer {
  const dataset = (id: number, text: string) =>
    Buffer.concat([Buffer.from([0x1c, 0x02, id]), u16(text.length), Buffer.from(text, 'latin1')]);
  const iptc = Buffer.concat([dataset(90, EMBEDDED.iptcCity), dataset(80, EMBEDDED.iptcByline)]);
  const resource = Buffer.concat([
    Buffer.from('8BIM', 'latin1'),
    Buffer.from([0x04, 0x04, 0x00, 0x00]),
    u32(iptc.length),
    iptc,
    iptc.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
  ]);
  const payload = Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), resource]);
  return Buffer.concat([Buffer.from([0xff, 0xed]), u16(payload.length + 2), payload]);
}

function comSegment(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), u16(text.length + 2), Buffer.from(text)]);
}

/**
 * A JPEG scan carrying everything a real camera/scanner/editor might embed: EXIF (make, model,
 * body serial, operator, description, copyright, capture time, GPS), XMP (creator, GPS), IPTC
 * (city, by-line), a COM comment, 300 dpi, and orientation 6 — the pixels are stored rotated, so
 * the page is only upright when the orientation is applied.
 */
export async function jpegWithEmbeddedMetadata(): Promise<Buffer> {
  const upright = await certificatePage();
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:exif="http://ns.adobe.com/exif/1.0/"><dc:creator>${EMBEDDED.xmpCreator}</dc:creator><exif:GPSLatitude>28,36.83N</exif:GPSLatitude></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const jpeg = await sharp(upright)
    .rotate(270)
    .jpeg({ quality: 92 })
    .withExif({
      IFD0: {
        Make: EMBEDDED.make,
        Model: EMBEDDED.model,
        Artist: EMBEDDED.operator,
        ImageDescription: EMBEDDED.description,
        Copyright: EMBEDDED.copyright,
      },
      IFD2: { BodySerialNumber: EMBEDDED.serial, DateTimeOriginal: '2019:05:17 10:42:00' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '28/1 36/1 50/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '77/1 12/1 32/1',
      },
    })
    .withXmp(xmp)
    .withMetadata({ orientation: 6, density: 300 })
    .toBuffer();
  return Buffer.concat([
    jpeg.subarray(0, 2),
    iptcSegment(),
    comSegment(EMBEDDED.comment),
    jpeg.subarray(2),
  ]);
}

/** A PNG chunk with a correct CRC. */
export function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body) >>> 0)]);
}

/** A 300-dpi PNG scan with EXIF (eXIf) and a tEXt "Author" chunk. */
export async function pngWithEmbeddedMetadata(): Promise<Buffer> {
  const png = await sharp(await certificatePage())
    .withExif({ IFD0: { Make: EMBEDDED.make, Artist: EMBEDDED.operator } })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
  // After the signature (8) and IHDR (25 bytes).
  return Buffer.concat([
    png.subarray(0, 33),
    pngChunk('tEXt', Buffer.from(`Author\0${EMBEDDED.pngAuthor}`, 'latin1')),
    png.subarray(33),
  ]);
}

/** Every embedded test value that must never reach a student. */
export function containsEmbeddedValue(bytes: Uint8Array): string | undefined {
  const text = Buffer.from(bytes).toString('latin1');
  return Object.values(EMBEDDED).find((value) => text.includes(value));
}
