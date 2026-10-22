import { HISTORICAL_DOCUMENT_RULES } from './historical-documents/schemas.js';
import { PAYMENT_EVIDENCE_RULES, PAYMENT_QR_RULES } from './examinations/re-exam-payments.js';
import { PROFILE_PHOTO_RULES } from './student-profile/schemas.js';

const MIB = 1024 * 1024;

/** Room for multipart framing and the form fields sent alongside the largest file. */
export const UPLOAD_REQUEST_OVERHEAD_BYTES = MIB;

/**
 * Largest HTTP request body any upload endpoint can legitimately need: the biggest per-endpoint file
 * limit plus multipart overhead. The web proxy buffers exactly this much, and the reviewer-gate
 * Caddy (`deploy/review-site.caddy`, `request_body max_size`) must allow exactly the same, so the
 * API — never a truncated body or an edge 413 — decides on every file within its own limit.
 */
export function uploadRequestBodyLimitBytes(importMaxFileMb: number): number {
  return (
    Math.max(
      importMaxFileMb * MIB,
      HISTORICAL_DOCUMENT_RULES.maxBytes,
      PROFILE_PHOTO_RULES.maxBytes,
      PAYMENT_EVIDENCE_RULES.maxBytes,
      PAYMENT_QR_RULES.maxBytes,
    ) + UPLOAD_REQUEST_OVERHEAD_BYTES
  );
}
