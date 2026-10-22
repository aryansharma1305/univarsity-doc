import { readFileSync } from 'node:fs';
import { importLimitsEnvSchema, uploadRequestBodyLimitBytes } from '@docversity/validation';
import { describe, expect, it } from 'vitest';

const site = readFileSync(new URL('../../../deploy/review-site.caddy', import.meta.url), 'utf8');

describe('reviewer-gate request body limit', () => {
  it('equals the web proxy buffer at the deployed import limit', () => {
    // Caddy admits exactly what the same-origin proxy forwards intact: nothing between the two
    // limits can be truncated, and every file within an API limit reaches the API.
    const match = /max_size (\d+)MiB/.exec(site);
    expect(match).not.toBeNull();
    const { IMPORT_MAX_FILE_MB } = importLimitsEnvSchema.parse({});
    expect(Number(match?.[1]) * 1024 * 1024).toBe(uploadRequestBodyLimitBytes(IMPORT_MAX_FILE_MB));
  });
});
