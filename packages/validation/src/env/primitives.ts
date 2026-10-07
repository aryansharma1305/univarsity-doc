import { z } from 'zod';

/**
 * Parses boolean-like environment strings strictly. `z.coerce.boolean()` is deliberately
 * avoided because it treats any non-empty string (including "false") as `true`.
 */
export const envBoolean = z
  .enum(['true', 'false', '1', '0'], {
    error: 'must be one of: true, false, 1, 0',
  })
  .transform((value) => value === 'true' || value === '1');

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

export const logLevelSchema = z
  .enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
  .default('log');

export const port = z.coerce.number().int().min(1).max(65_535);

export const httpUrl = z.url({ protocol: /^https?$/ });
