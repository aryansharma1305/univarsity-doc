import { HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ERROR_CODES, PAYMENT_EVIDENCE_RULES, PAYMENT_QR_RULES } from '@docversity/validation';
import { AppError, Errors } from '../common/app-error.js';
import { inspectDocument } from '../historical-documents/document-file.js';
import {
  createStudentCopy,
  type ImageContentType,
  StudentCopyError,
} from '../historical-documents/student-copy.js';
import type { UploadedPaymentFile } from './payment-upload.interceptor.js';

/** A file ready to store: content-checked, images re-encoded without embedded metadata. */
export interface PreparedFile {
  bytes: Uint8Array;
  contentType: 'application/pdf' | ImageContentType;
  extension: 'pdf' | 'jpg' | 'png';
  sizeBytes: number;
  sha256: string;
}

export const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function unsupported(path: string, message: string): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.unsupportedFile, message, {
    details: [{ path, message }],
  });
}

function bytesOf(file: UploadedPaymentFile): Uint8Array {
  return new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);
}

/** Re-encodes an accepted image (no EXIF/GPS/XMP/IPTC/text) — the only form ever stored. */
async function cleanImage(
  bytes: Uint8Array,
  contentType: ImageContentType,
  path: string,
): Promise<PreparedFile> {
  try {
    const copy = await createStudentCopy(bytes, contentType);
    return {
      bytes: copy.bytes,
      contentType: copy.contentType,
      extension: copy.extension,
      sizeBytes: copy.sizeBytes,
      sha256: copy.sha256,
    };
  } catch (error) {
    if (!(error instanceof StudentCopyError)) throw error;
    throw unsupported(path, 'The image could not be processed. Upload a standard PNG or JPEG.');
  }
}

/**
 * A staff-uploaded payment QR image: PNG or JPEG only, decoded in full, stored re-encoded. Docversity
 * cannot read what a QR encodes — the approver confirms it is the university's real payment QR.
 */
export async function prepareQrImage(file: UploadedPaymentFile | undefined): Promise<PreparedFile> {
  if (!file || file.size === 0) {
    throw Errors.validation([{ path: 'file', message: 'Choose the QR image (PNG or JPEG).' }]);
  }
  const accepted: readonly string[] = PAYMENT_QR_RULES.acceptedTypes;
  if (!accepted.includes(file.mimetype.toLowerCase())) {
    throw unsupported('file', 'Upload the QR code as a PNG or JPEG image.');
  }
  const bytes = bytesOf(file);
  const inspected = await inspectDocument(bytes, file.mimetype, PAYMENT_QR_RULES);
  if (inspected.contentType === 'application/pdf') {
    throw unsupported('file', 'Upload the QR code as a PNG or JPEG image.');
  }
  return cleanImage(bytes, inspected.contentType, 'file');
}

/**
 * Payment evidence from a student: a static PDF (no scripts, attachments, forms or encryption) kept
 * as received, or a JPEG/PNG screenshot stored re-encoded without embedded metadata.
 */
export async function prepareEvidence(
  file: UploadedPaymentFile | undefined,
): Promise<PreparedFile | null> {
  if (!file || file.size === 0) return null;
  const bytes = bytesOf(file);
  const inspected = await inspectDocument(bytes, file.mimetype, PAYMENT_EVIDENCE_RULES);
  if (inspected.contentType !== 'application/pdf') {
    return cleanImage(bytes, inspected.contentType, 'evidence');
  }
  return {
    bytes,
    contentType: 'application/pdf',
    extension: 'pdf',
    sizeBytes: bytes.byteLength,
    sha256: sha256Of(bytes),
  };
}
