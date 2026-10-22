import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_DOCUMENT_RULES,
  UPLOAD_REQUEST_OVERHEAD_BYTES,
  uploadRequestBodyLimitBytes,
} from '../src/index.js';

const MIB = 1024 * 1024;

describe('uploadRequestBodyLimitBytes', () => {
  it('covers the largest upload of any endpoint, not only workbooks', () => {
    // Default import limit (10 MiB) is below the historical-document limit (15 MiB).
    expect(uploadRequestBodyLimitBytes(10)).toBe(16 * MIB);
    expect(uploadRequestBodyLimitBytes(10)).toBe(
      HISTORICAL_DOCUMENT_RULES.maxBytes + UPLOAD_REQUEST_OVERHEAD_BYTES,
    );
  });

  it('follows a larger configured import limit', () => {
    expect(uploadRequestBodyLimitBytes(20)).toBe(21 * MIB);
  });
});
