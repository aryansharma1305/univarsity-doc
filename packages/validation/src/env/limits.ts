import { z } from 'zod';

/** BullMQ key prefix in Redis. Producers (API) and the worker must use the same value. */
export const queueEnvSchema = z.object({
  QUEUE_PREFIX: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/, 'use 1–32 lower-case letters, digits, "_" or "-"')
    .default('bull'),
});

/**
 * Spreadsheet import resource limits. Defaults are safe for development; see
 * docs/architecture/imports.md for production tuning.
 */
export const importLimitsEnvSchema = z.object({
  /** Largest accepted upload. */
  IMPORT_MAX_FILE_MB: z.coerce.number().int().min(1).max(100).default(10),
  /** Largest total uncompressed size of the parts inside an .xlsx (zip-bomb guard). */
  IMPORT_MAX_UNCOMPRESSED_MB: z.coerce.number().int().min(1).max(2_000).default(100),
  /** Data rows (excluding the header row) allowed in the imported worksheet. */
  IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(200_000).default(10_000),
  /** Columns allowed in the imported worksheet. */
  IMPORT_MAX_COLUMNS: z.coerce.number().int().min(1).max(500).default(50),
  /** Rows committed per database transaction. */
  IMPORT_BATCH_SIZE: z.coerce.number().int().min(10).max(2_000).default(250),
});

export type QueueEnv = z.infer<typeof queueEnvSchema>;
export type ImportLimitsEnv = z.infer<typeof importLimitsEnvSchema>;
