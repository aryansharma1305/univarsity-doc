import { createHash } from 'node:crypto';
import { type EmbeddedMetadataCategory, HISTORICAL_DOCUMENT_RULES } from '@docversity/validation';
import sharp, { type Metadata } from 'sharp';

/**
 * Student copies of image documents (Phase 8 hardening).
 *
 * The uploaded original stays byte-for-byte unchanged as evidence. Students receive a separate copy
 * that is re-encoded from the decoded pixels, so nothing embedded in the original travels with it:
 * no EXIF (GPS, camera/scanner make, model and serial number, operator, capture time), XMP, IPTC,
 * PNG text chunks or embedded thumbnails. Orientation is applied to the pixels, colours are
 * converted to sRGB (a standard, non-identifying profile is attached), and the image is NOT resized.
 * JPEG is re-encoded once at quality 95 without chroma subsampling; PNG stays lossless. The print
 * resolution (DPI) is carried in the JFIF header (JPEG) or pHYs chunk (PNG), not in EXIF.
 *
 * Every copy is checked structurally against an allow-list of JPEG segments / PNG chunks — at
 * creation and again whenever it is served — so a copy that could carry metadata is never delivered.
 */

export type ImageContentType = 'image/jpeg' | 'image/png';

export interface StudentCopy {
  bytes: Uint8Array;
  contentType: ImageContentType;
  extension: 'jpg' | 'png';
  sizeBytes: number;
  sha256: string;
  /** Kinds of metadata found in the ORIGINAL (values are never kept). */
  embeddedMetadata: EmbeddedMetadataCategory[];
}

/** The copy could not be produced or failed its checks. Callers never fall back to the original. */
export class StudentCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudentCopyError';
  }
}

const JPEG_QUALITY = 95;

const decodeOptions = {
  limitInputPixels: HISTORICAL_DOCUMENT_RULES.maxImagePixels,
  failOn: 'error',
} as const;

// ----------------------------------------------------------------------------------------------
// Detection of embedded metadata (categories only)
// ----------------------------------------------------------------------------------------------

const EXIF_DEVICE_TAGS = new Set([
  0x010f, // Make
  0x0110, // Model
  0xa420, // ImageUniqueID
  0xa431, // BodySerialNumber
  0xa433, // LensMake
  0xa434, // LensModel
  0xa435, // LensSerialNumber
]);
const EXIF_PERSON_TAGS = new Set([
  0x013b, // Artist
  0x8298, // Copyright
  0xa430, // CameraOwnerName
  0x9c9d, // XPAuthor
]);
const EXIF_TEXT_TAGS = new Set([
  0x010e, // ImageDescription
  0x9286, // UserComment
  0x9c9b, // XPTitle
  0x9c9c, // XPComment
  0x9c9e, // XPKeywords
  0x9c9f, // XPSubject
]);
const EXIF_IFD_POINTER = 0x8769;
const GPS_IFD_POINTER = 0x8825;

/** Walks the TIFF structure of an EXIF block and classifies the tags it contains. */
function exifCategories(raw: Buffer, found: Set<EmbeddedMetadataCategory>): void {
  const buf = raw.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? raw.subarray(6) : raw;
  const order = buf.subarray(0, 2).toString('latin1');
  if (buf.length < 8 || (order !== 'II' && order !== 'MM')) {
    found.add('OTHER');
    return;
  }
  const le = order === 'II';
  const u16 = (offset: number) => (le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset));
  const u32 = (offset: number) => (le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset));
  if (u16(2) !== 42) {
    found.add('OTHER');
    return;
  }
  const visited = new Set<number>();
  const visit = (offset: number, kind: 'ifd' | 'exif' | 'gps', depth: number): void => {
    if (depth > 4 || offset < 8 || offset + 2 > buf.length || visited.has(offset)) return;
    visited.add(offset);
    const count = u16(offset);
    if (count > 1024) return;
    for (let index = 0; index < count; index += 1) {
      const entry = offset + 2 + index * 12;
      if (entry + 12 > buf.length) return;
      const tag = u16(entry);
      if (kind === 'gps') {
        // Tag 0 is only the GPS format version; anything else is location data.
        if (tag !== 0) found.add('LOCATION');
        continue;
      }
      if (tag === EXIF_IFD_POINTER) visit(u32(entry + 8), 'exif', depth + 1);
      else if (tag === GPS_IFD_POINTER) visit(u32(entry + 8), 'gps', depth + 1);
      else if (EXIF_DEVICE_TAGS.has(tag)) found.add('DEVICE');
      else if (EXIF_PERSON_TAGS.has(tag)) found.add('PERSON');
      else if (EXIF_TEXT_TAGS.has(tag)) found.add('TEXT');
      else found.add('OTHER');
    }
    // IFD0 links to IFD1 (an embedded thumbnail of the original).
    const next = offset + 2 + count * 12;
    if (kind === 'ifd' && next + 4 <= buf.length) visit(u32(next), 'ifd', depth + 1);
  };
  visit(u32(4), 'ifd', 0);
}

const XMP_RULES: readonly [RegExp, EmbeddedMetadataCategory][] = [
  [
    /GPS(Latitude|Longitude|Altitude|Position)|photoshop:(City|State|Country)|Location(Created|Shown)|Iptc4xmpCore:Location/i,
    'LOCATION',
  ],
  [
    /tiff:(Make|Model)|aux:(SerialNumber|Lens)|exifEX:(BodySerialNumber|LensSerialNumber|CameraOwnerName)/i,
    'DEVICE',
  ],
  [
    /dc:creator|dc:rights|xmpRights:|photoshop:(Credit|AuthorsPosition)|CreatorContactInfo/i,
    'PERSON',
  ],
  [/dc:(description|title|subject)|photoshop:(Headline|Instructions|CaptionWriter)/i, 'TEXT'],
];

function xmpCategories(xmp: string, found: Set<EmbeddedMetadataCategory>): void {
  const hits = XMP_RULES.filter(([pattern]) => pattern.test(xmp));
  for (const [, category] of hits) found.add(category);
  if (hits.length === 0) found.add('OTHER');
}

/** IPTC-IIM datasets (record 2) inside a raw block or a Photoshop resource wrapper. */
function iptcCategories(iptc: Buffer, found: Set<EmbeddedMetadataCategory>): void {
  let matched = false;
  for (let i = 0; i + 2 < iptc.length; i += 1) {
    if (iptc[i] !== 0x1c || iptc[i + 1] !== 0x02) continue;
    const dataset = iptc[i + 2] ?? 0;
    if ([90, 92, 95, 100, 101].includes(dataset)) found.add('LOCATION');
    else if ([80, 85, 116, 118, 122].includes(dataset)) found.add('PERSON');
    else if ([5, 25, 105, 120].includes(dataset)) found.add('TEXT');
    else continue;
    matched = true;
  }
  if (!matched) found.add('OTHER');
}

/** Kinds of metadata embedded in an image, from sharp's metadata. Never returns the values. */
export function embeddedMetadataCategories(metadata: Metadata): EmbeddedMetadataCategory[] {
  const found = new Set<EmbeddedMetadataCategory>();
  if (metadata.exif && metadata.exif.length > 0) exifCategories(metadata.exif, found);
  if (metadata.xmp && metadata.xmp.length > 0) {
    xmpCategories(metadata.xmp.toString('utf8'), found);
  }
  if (metadata.iptc && metadata.iptc.length > 0) iptcCategories(metadata.iptc, found);
  if (metadata.tifftagPhotoshop && metadata.tifftagPhotoshop.length > 0) found.add('OTHER');
  for (const comment of metadata.comments ?? []) {
    if (/author|artist|copyright|creator|owner|operator/i.test(comment.keyword)) {
      found.add('PERSON');
    } else if (/location|gps|geo/i.test(comment.keyword)) found.add('LOCATION');
    else found.add('TEXT');
  }
  const order: EmbeddedMetadataCategory[] = ['LOCATION', 'DEVICE', 'PERSON', 'TEXT', 'OTHER'];
  return order.filter((category) => found.has(category));
}

// ----------------------------------------------------------------------------------------------
// Structural allow-list (no metadata can hide in an accepted copy)
// ----------------------------------------------------------------------------------------------

function jpegMarkerAllowed(marker: number, data: Buffer): boolean {
  if (marker === 0xe0) return data.subarray(0, 5).toString('latin1') === 'JFIF\0';
  if (marker === 0xe2) return data.subarray(0, 12).toString('latin1') === 'ICC_PROFILE\0';
  if (marker >= 0xe1 && marker <= 0xef) return false; // EXIF/XMP (APP1), IPTC (APP13), …
  if (marker === 0xfe) return false; // COM
  // DQT, DHT, DAC, DRI, DNL, EXP and the SOF markers (C0–CF).
  return (
    marker === 0xdb ||
    marker === 0xc4 ||
    marker === 0xcc ||
    marker === 0xdd ||
    marker === 0xdc ||
    marker === 0xdf ||
    (marker >= 0xc0 && marker <= 0xcf)
  );
}

function assertCleanJpeg(bytes: Buffer): void {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new StudentCopyError('not a JPEG');
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) throw new StudentCopyError('malformed JPEG segment');
    let marker = bytes[i + 1] ?? 0;
    while (marker === 0xff && i + 2 < bytes.length) {
      i += 1;
      marker = bytes[i + 1] ?? 0;
    }
    if (marker === 0xd9) {
      if (i + 2 !== bytes.length) throw new StudentCopyError('data after the end of the JPEG');
      return;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) throw new StudentCopyError('truncated JPEG');
    const length = bytes.readUInt16BE(i + 2);
    const data = bytes.subarray(i + 4, i + 2 + length);
    if (marker !== 0xda && !jpegMarkerAllowed(marker, data)) {
      throw new StudentCopyError(`JPEG segment 0x${marker.toString(16)} is not allowed`);
    }
    i += 2 + length;
    if (marker === 0xda) {
      // Skip entropy-coded data up to the next real marker.
      while (i + 1 < bytes.length) {
        if (bytes[i] === 0xff) {
          const next = bytes[i + 1] ?? 0;
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        i += 1;
      }
    }
  }
  throw new StudentCopyError('the JPEG has no end marker');
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_ALLOWED_CHUNKS = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'pHYs',
  'iCCP',
  'sRGB',
  'gAMA',
  'cHRM',
  'sBIT',
  'bKGD',
]);

function assertCleanPng(bytes: Buffer): void {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new StudentCopyError('not a PNG');
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(i);
    const type = bytes.subarray(i + 4, i + 8).toString('latin1');
    if (!PNG_ALLOWED_CHUNKS.has(type)) {
      throw new StudentCopyError(`PNG chunk ${type} is not allowed`);
    }
    i += 12 + length;
    if (type === 'IEND') {
      if (i !== bytes.length) throw new StudentCopyError('data after the end of the PNG');
      return;
    }
  }
  throw new StudentCopyError('the PNG has no end chunk');
}

/**
 * Throws unless the image consists only of pixel data, colour/resolution information and an ICC
 * profile — no EXIF, XMP, IPTC, comments, text chunks or trailing data.
 */
export function assertNoEmbeddedMetadata(bytes: Uint8Array, contentType: ImageContentType): void {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === 'image/jpeg') assertCleanJpeg(buffer);
  else assertCleanPng(buffer);
}

// ----------------------------------------------------------------------------------------------
// Creation
// ----------------------------------------------------------------------------------------------

/** Writes the print resolution into the JFIF APP0 header (inserted right after SOI if missing). */
export function withJfifDensity(jpeg: Buffer, dpi: number): Buffer {
  const density = Math.min(65535, Math.max(1, Math.round(dpi)));
  if (
    jpeg[2] === 0xff &&
    jpeg[3] === 0xe0 &&
    jpeg.subarray(6, 11).toString('latin1') === 'JFIF\0'
  ) {
    const out = Buffer.from(jpeg);
    out[13] = 1; // units: dots per inch
    out.writeUInt16BE(density, 14);
    out.writeUInt16BE(density, 16);
    return out;
  }
  const app0 = Buffer.from([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    density >> 8,
    density & 0xff,
    density >> 8,
    density & 0xff,
    0x00,
    0x00,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app0, jpeg.subarray(2)]);
}

/**
 * Creates the student copy of an accepted JPEG/PNG and verifies it (format, dimensions after
 * orientation, full decode, no embedded metadata). Throws `StudentCopyError` on any problem.
 */
export async function createStudentCopy(
  original: Uint8Array,
  contentType: ImageContentType,
): Promise<StudentCopy> {
  let metadata: Metadata;
  let encoded: Buffer;
  try {
    metadata = await sharp(original, decodeOptions).metadata();
    const pipeline = sharp(original, decodeOptions).autoOrient().withIccProfile('srgb');
    encoded =
      contentType === 'image/jpeg'
        ? await pipeline
            .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4', mozjpeg: false })
            .toBuffer()
        : await pipeline.png().toBuffer();
  } catch {
    throw new StudentCopyError('the image could not be re-encoded');
  }
  const bytes =
    contentType === 'image/jpeg' && metadata.density
      ? withJfifDensity(encoded, metadata.density)
      : encoded;

  assertNoEmbeddedMetadata(bytes, contentType);
  let copy: Metadata;
  try {
    copy = await sharp(bytes, decodeOptions).metadata();
    await sharp(bytes, decodeOptions).raw().toBuffer();
  } catch {
    throw new StudentCopyError('the student copy could not be decoded');
  }
  if (copy.format !== (contentType === 'image/jpeg' ? 'jpeg' : 'png')) {
    throw new StudentCopyError('the student copy has the wrong format');
  }
  if (copy.width !== metadata.autoOrient.width || copy.height !== metadata.autoOrient.height) {
    throw new StudentCopyError('the student copy has different dimensions');
  }
  if (copy.exif ?? copy.xmp ?? copy.iptc ?? copy.tifftagPhotoshop ?? copy.comments?.[0]) {
    throw new StudentCopyError('the student copy still carries metadata');
  }
  return {
    bytes,
    contentType,
    extension: contentType === 'image/jpeg' ? 'jpg' : 'png',
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    embeddedMetadata: embeddedMetadataCategories(metadata),
  };
}
