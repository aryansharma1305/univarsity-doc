import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  assertNoEmbeddedMetadata,
  createStudentCopy,
  StudentCopyError,
  withJfifDensity,
} from '../../src/historical-documents/student-copy.js';
import {
  certificatePage,
  containsEmbeddedValue,
  EMBEDDED,
  jpegWithEmbeddedMetadata,
  pngChunk,
  pngWithEmbeddedMetadata,
  scans,
} from './support.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Peak signal-to-noise ratio of two equally sized RGB renderings (higher = closer). */
async function psnr(a: Uint8Array, b: Uint8Array): Promise<number> {
  const [left, right] = await Promise.all(
    [a, b].map((bytes) =>
      sharp(bytes).autoOrient().removeAlpha().toColourspace('srgb').raw().toBuffer(),
    ),
  );
  if (left === undefined || right === undefined) throw new Error('missing rendering');
  if (left.length !== right.length) throw new Error('size mismatch');
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) sum += ((left[i] ?? 0) - (right[i] ?? 0)) ** 2;
  const mse = sum / left.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

/** Mean brightness of a square region of the displayed (oriented) image. */
async function brightness(bytes: Uint8Array, left: number, top: number, size = 40) {
  const { data } = await sharp(bytes)
    .autoOrient()
    .extract({ left, top, width: size, height: size })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data.reduce((total, value) => total + value, 0) / data.length;
}

describe('the synthetic fixtures really carry identifying metadata', () => {
  it('JPEG: EXIF with GPS, device serial and operator; XMP; IPTC; COM; orientation 6; 300 dpi', async () => {
    const jpeg = await jpegWithEmbeddedMetadata();
    const meta = await sharp(jpeg).metadata();
    expect(meta.orientation).toBe(6);
    expect(meta.density).toBe(300);
    expect(meta.exif).toBeDefined();
    expect(meta.xmp).toBeDefined();
    expect(meta.iptc).toBeDefined();
    for (const value of [
      EMBEDDED.serial,
      EMBEDDED.operator,
      EMBEDDED.xmpCreator,
      EMBEDDED.iptcCity,
      EMBEDDED.comment,
    ]) {
      expect(jpeg.toString('latin1')).toContain(value);
    }
    // Stored rotated: 1200 wide × 900 high; displayed upright 900 × 1200.
    expect([meta.width, meta.height]).toEqual([1200, 900]);
    expect([meta.autoOrient.width, meta.autoOrient.height]).toEqual([900, 1200]);
  });
});

describe('createStudentCopy', () => {
  it('removes EXIF (GPS, serial, operator), XMP, IPTC and comments from a JPEG and records only the kinds', async () => {
    const original = await jpegWithEmbeddedMetadata();
    const before = sha(original);
    const copy = await createStudentCopy(original, 'image/jpeg');

    expect(sha(original)).toBe(before); // the original is never modified
    expect(copy.embeddedMetadata).toEqual(['LOCATION', 'DEVICE', 'PERSON', 'TEXT', 'OTHER']);
    expect(containsEmbeddedValue(copy.bytes)).toBeUndefined();
    const text = Buffer.from(copy.bytes).toString('latin1');
    for (const marker of [
      'Exif\0\0',
      'http://ns.adobe.com/xap',
      'xmpmeta',
      'Photoshop 3.0',
      '8BIM',
    ]) {
      expect(text).not.toContain(marker);
    }
    const meta = await sharp(copy.bytes).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', density: 300, chromaSubsampling: '4:4:4' });
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.comments).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(copy.sha256).toBe(sha(copy.bytes));
    expect(copy.sizeBytes).toBe(copy.bytes.byteLength);
    expect(() => {
      assertNoEmbeddedMetadata(copy.bytes, 'image/jpeg');
    }).not.toThrow();
  });

  it('applies the orientation to the pixels and keeps the page legible at full size', async () => {
    const original = await jpegWithEmbeddedMetadata();
    const copy = await createStudentCopy(original, 'image/jpeg');
    const meta = await sharp(copy.bytes).metadata();
    // Not resized; upright without relying on an orientation tag.
    expect([meta.width, meta.height]).toEqual([900, 1200]);
    expect(await brightness(copy.bytes, 20, 20)).toBeLessThan(60); // dark marker top-left
    expect(await brightness(copy.bytes, 820, 20)).toBeGreaterThan(230); // white top-right
    // Visually the same page as the oriented original (≥ 40 dB is visually indistinguishable).
    expect(await psnr(original, copy.bytes)).toBeGreaterThan(40);
    // The printed text area is preserved closely as well (crop around "No. ACC/CERT/1001").
    const crop = (bytes: Uint8Array) =>
      sharp(bytes)
        .autoOrient()
        .extract({ left: 60, top: 450, width: 700, height: 100 })
        .png()
        .toBuffer();
    expect(await psnr(await crop(original), await crop(copy.bytes))).toBeGreaterThan(35);
  });

  it('keeps PNG lossless while removing eXIf and text chunks', async () => {
    const original = await pngWithEmbeddedMetadata();
    const originalMeta = await sharp(original).metadata();
    expect(originalMeta.comments?.[0]?.keyword).toBe('Author');
    const copy = await createStudentCopy(original, 'image/png');

    expect(copy.embeddedMetadata).toEqual(expect.arrayContaining(['DEVICE', 'PERSON']));
    expect(containsEmbeddedValue(copy.bytes)).toBeUndefined();
    const meta = await sharp(copy.bytes).metadata();
    expect(meta).toMatchObject({ format: 'png', density: 300, width: 900, height: 1200 });
    expect(meta.exif).toBeUndefined();
    expect(meta.comments).toBeUndefined();
    expect(await psnr(original, copy.bytes)).toBe(Infinity); // pixel-identical
  });

  it('still re-encodes and verifies an image without metadata (nothing recorded)', async () => {
    const copy = await createStudentCopy(await scans.jpeg(), 'image/jpeg');
    expect(copy.embeddedMetadata).toEqual([]);
    expect(copy.contentType).toBe('image/jpeg');
  });

  it('fails (never passes through) when the image cannot be decoded', async () => {
    const truncated = (await certificatePage()).subarray(0, 400);
    await expect(createStudentCopy(truncated, 'image/png')).rejects.toBeInstanceOf(
      StudentCopyError,
    );
  });
});

describe('assertNoEmbeddedMetadata (served copies are re-checked)', () => {
  it('rejects JPEGs with EXIF/XMP, IPTC or comments and trailing data', async () => {
    const original = await jpegWithEmbeddedMetadata();
    expect(() => {
      assertNoEmbeddedMetadata(original, 'image/jpeg');
    }).toThrow(StudentCopyError);
    const clean = (await createStudentCopy(await scans.jpeg(), 'image/jpeg')).bytes;
    const withComment = Buffer.concat([
      Buffer.from(clean).subarray(0, 2),
      Buffer.from([0xff, 0xfe, 0x00, 0x06]),
      Buffer.from('note'),
      Buffer.from(clean).subarray(2),
    ]);
    expect(() => {
      assertNoEmbeddedMetadata(withComment, 'image/jpeg');
    }).toThrow(/0xfe/);
    expect(() => {
      assertNoEmbeddedMetadata(Buffer.concat([clean, Buffer.from('trailing')]), 'image/jpeg');
    }).toThrow(/after the end/);
  });

  it('rejects PNG text and eXIf chunks', async () => {
    const clean = Buffer.from((await createStudentCopy(await scans.png(), 'image/png')).bytes);
    const withText = Buffer.concat([
      clean.subarray(0, 33),
      pngChunk('iTXt', Buffer.from('Comment\0\0\0\0\0note')),
      clean.subarray(33),
    ]);
    expect(() => {
      assertNoEmbeddedMetadata(clean, 'image/png');
    }).not.toThrow();
    expect(() => {
      assertNoEmbeddedMetadata(withText, 'image/png');
    }).toThrow(/iTXt/);
  });

  it('writes the print resolution into the JFIF header', async () => {
    const plain = await sharp(await certificatePage())
      .jpeg()
      .toBuffer();
    const stamped = withJfifDensity(plain, 600);
    expect((await sharp(stamped).metadata()).density).toBe(600);
    expect(() => {
      assertNoEmbeddedMetadata(stamped, 'image/jpeg');
    }).not.toThrow();
  });
});
