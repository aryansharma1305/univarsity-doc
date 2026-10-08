import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  databaseEnvSchema,
  importLimitsEnvSchema,
  logLevelSchema,
  nodeEnvSchema,
  parseEnv,
  queueEnvSchema,
  redisEnvSchema,
  storageEnvSchema,
} from '@docversity/validation';
import { z } from 'zod';

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),
  /** Import steps processed in parallel (each is memory-heavy: a whole workbook is parsed). */
  IMPORT_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
  ...redisEnvSchema.shape,
  ...queueEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...storageEnvSchema.shape,
  ...importLimitsEnvSchema.shape,
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Loads the monorepo root .env (local development only) without overriding existing variables. */
export function loadRootEnv(): void {
  const file = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return Object.freeze(parseEnv('worker', workerEnvSchema, source));
}
