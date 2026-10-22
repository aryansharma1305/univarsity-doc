import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Phase 12C.1 fixed student academic samples. Each PDF was rendered once from the approved Phase 12C
 * template with its standard synthetic record (scripts/generate-academic-samples.mjs) and is shipped
 * as a private package asset. Requests serve these exact bytes: no rendering, student data, storage
 * write or issuance record. Changing a file requires a reviewed regeneration and updated pins.
 */
export const ACADEMIC_SAMPLE_PINS = Object.freeze({
  'sample-course-completion-v1': {
    certificateType: 'COURSE_COMPLETION',
    bytes: 92_257,
    sha256: 'c124b9c093342685758c02b9586a7c346d5b7616863fc27c4d3ffc1c0532791c',
  },
  'sample-transcript-v1': {
    certificateType: 'TRANSCRIPT',
    bytes: 77_283,
    sha256: 'b4003704dc2c0ad1cdba26c187913a2e63951e5c71045d09964f53cb7edd3f45',
  },
  'sample-provisional-v1': {
    certificateType: 'PROVISIONAL',
    bytes: 94_463,
    sha256: 'de846bae590eb474efb298ba417da2b349209b84926dc49bea2eb474846ae314',
  },
  'sample-character-v1': {
    certificateType: 'CHARACTER',
    bytes: 85_575,
    sha256: '3a894c5ab72e59befcf9d0d40deb8c0eb77b068eadd056d24bc0268bf0a9cd8a',
  },
  'sample-migration-v1': {
    certificateType: 'MIGRATION',
    bytes: 86_955,
    sha256: 'e68c94b3db0d55e7dcaa27dc6125005f73b9f8164eef2507861f85127df47490',
  },
} as const);
export type AcademicSamplePinId = keyof typeof ACADEMIC_SAMPLE_PINS;

/** Upper bound for any academic sample file (each is under 100 KB). */
export const ACADEMIC_SAMPLE_MAX_BYTES = 512 * 1024;

/** Safe diagnostics only: the sample identifier and which check failed, never file contents. */
export class AcademicSampleIntegrityError extends Error {
  // sampleId is always a pinned identifier or '(unknown)'.
  constructor(
    readonly sampleId: string,
    readonly check:
      'unknown-sample' | 'type-mismatch' | 'unreadable' | 'size' | 'header' | 'sha256',
  ) {
    super(`Academic sample ${sampleId} failed its ${check} check.`);
    this.name = 'AcademicSampleIntegrityError';
  }
}

const verified = new Map<string, Buffer>();

function pinFor(sampleId: string, expectedType: string) {
  // Never echo an unrecognised, caller-supplied identifier into errors or logs.
  if (!Object.prototype.hasOwnProperty.call(ACADEMIC_SAMPLE_PINS, sampleId))
    throw new AcademicSampleIntegrityError('(unknown)', 'unknown-sample');
  const pin = ACADEMIC_SAMPLE_PINS[sampleId as AcademicSamplePinId];
  if (pin.certificateType !== expectedType)
    throw new AcademicSampleIntegrityError(sampleId, 'type-mismatch');
  return pin;
}

/**
 * Checks candidate bytes against a sample's pin: identity (known ID mapped to the server-derived
 * type), size bound and exact size, PDF header and SHA-256. Throws AcademicSampleIntegrityError.
 */
export function verifyAcademicSample(
  sampleId: string,
  expectedType: string,
  bytes: Buffer,
): Buffer {
  const pin = pinFor(sampleId, expectedType);
  if (bytes.length > ACADEMIC_SAMPLE_MAX_BYTES || bytes.length !== pin.bytes)
    throw new AcademicSampleIntegrityError(sampleId, 'size');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-')
    throw new AcademicSampleIntegrityError(sampleId, 'header');
  if (createHash('sha256').update(bytes).digest('hex') !== pin.sha256)
    throw new AcademicSampleIntegrityError(sampleId, 'sha256');
  return bytes;
}

/**
 * The verified bytes of one academic sample, or an AcademicSampleIntegrityError. `expectedType` is the
 * server-derived certificate type; a pin mapped to another type is refused. Files are verified before
 * their bytes are cached in memory; callers always receive a copy.
 */
export function academicCertificateSample(sampleId: string, expectedType: string): Buffer {
  pinFor(sampleId, expectedType);
  const cached = verified.get(sampleId);
  if (cached) return Buffer.from(cached);
  let bytes: Buffer;
  try {
    bytes = readFileSync(new URL(`../assets/samples/academic/${sampleId}.pdf`, import.meta.url));
  } catch {
    throw new AcademicSampleIntegrityError(sampleId, 'unreadable');
  }
  verified.set(sampleId, verifyAcademicSample(sampleId, expectedType, bytes));
  return Buffer.from(bytes);
}
