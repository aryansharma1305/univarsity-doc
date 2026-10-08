import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, PROFILE_PHOTO_RULES } from '@docversity/validation';
import sharp, { type Metadata } from 'sharp';
import { AppError } from '../common/app-error.js';

export interface ProcessedPhoto {
  /** Normalised JPEG: auto-oriented, longest side ≤ storedMaxSide, all metadata (EXIF/GPS) removed. */
  bytes: Uint8Array;
  width: number;
  height: number;
}

const FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Decoder budget (decompression-bomb guard), independent of the dimension rules below. */
const MAX_INPUT_PIXELS = PROFILE_PHOTO_RULES.maxWidth * PROFILE_PHOTO_RULES.maxHeight;

function invalid(message: string): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.unsupportedFile, message, {
    details: [{ path: 'photo', message }],
  });
}

/**
 * Validates a photo by DECODING it (the declared type and file name are not trusted), checks its
 * dimensions and re-encodes it, so only clean pixels are ever stored. Anything that is not a single
 * still JPEG/PNG/WebP image within the limits is refused.
 */
export async function processProfilePhoto(
  input: Uint8Array,
  declaredType: string,
): Promise<ProcessedPhoto> {
  const accepted: readonly string[] = PROFILE_PHOTO_RULES.acceptedTypes;
  if (!accepted.includes(declaredType.toLowerCase())) {
    throw invalid('Upload a JPEG, PNG or WebP photo.');
  }
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const };
  let metadata: Metadata;
  try {
    metadata = await sharp(input, options).metadata();
  } catch {
    throw invalid('The file is not a readable image. Upload a JPEG, PNG or WebP photo.');
  }
  if (!FORMATS.has(metadata.format)) {
    throw invalid('Upload a JPEG, PNG or WebP photo.');
  }
  if ((metadata.pages ?? 1) > 1) throw invalid('Animated images are not accepted.');
  const { width, height } = metadata.autoOrient;
  if (width < PROFILE_PHOTO_RULES.minWidth || height < PROFILE_PHOTO_RULES.minHeight) {
    throw invalid(
      `The photo must be at least ${PROFILE_PHOTO_RULES.minWidth} × ${PROFILE_PHOTO_RULES.minHeight} pixels.`,
    );
  }
  if (width > PROFILE_PHOTO_RULES.maxWidth || height > PROFILE_PHOTO_RULES.maxHeight) {
    throw invalid(
      `The photo must be at most ${PROFILE_PHOTO_RULES.maxWidth} × ${PROFILE_PHOTO_RULES.maxHeight} pixels.`,
    );
  }
  try {
    const { data, info } = await sharp(input, options)
      .autoOrient()
      .resize({
        width: PROFILE_PHOTO_RULES.storedMaxSide,
        height: PROFILE_PHOTO_RULES.storedMaxSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    throw invalid('The photo could not be processed. Upload a different JPEG, PNG or WebP photo.');
  }
}

/** Content type of stored image bytes, from their signature (served photos are never guessed). */
export function imageContentType(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return undefined;
}
