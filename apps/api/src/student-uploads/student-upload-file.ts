import { HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ERROR_CODES } from '@docversity/validation';
import { AppError } from '../common/app-error.js';
import { inspectDocument } from '../historical-documents/document-file.js';
import { createStudentCopy, StudentCopyError } from '../historical-documents/student-copy.js';

export interface ProcessedUpload {
  bytes: Uint8Array;
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png';
  extension: 'pdf' | 'jpg' | 'png';
  sha256: string;
}

/**
 * Validates a student upload by its CONTENT (same rules as historical documents: PDF without active
 * content or encryption, decodable single-frame JPEG/PNG). Images are stored only as a re-encoded
 * copy without embedded metadata (EXIF/GPS/XMP/IPTC/text); the original image bytes are never kept.
 * PDFs are kept as uploaded, as historical documents are.
 */
export async function processStudentUpload(
  input: Uint8Array,
  declaredType: string,
): Promise<ProcessedUpload> {
  const inspected = await inspectDocument(input, declaredType);
  if (inspected.contentType === 'application/pdf') {
    return {
      bytes: input,
      contentType: 'application/pdf',
      extension: 'pdf',
      sha256: createHash('sha256').update(input).digest('hex'),
    };
  }
  try {
    const copy = await createStudentCopy(input, inspected.contentType);
    return {
      bytes: copy.bytes,
      contentType: copy.contentType,
      extension: copy.extension,
      sha256: copy.sha256,
    };
  } catch (error) {
    if (!(error instanceof StudentCopyError)) throw error;
    const message = 'The image could not be processed. Upload a different JPEG or PNG scan.';
    throw new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.unsupportedFile, message, {
      details: [{ path: 'file', message }],
    });
  }
}
