import { z } from 'zod';
import { envBoolean, httpUrl } from './primitives.js';

/** PostgreSQL connection used by Prisma. */
export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
});

/** Redis connection used for health checks now and BullMQ / sessions later. */
export const redisEnvSchema = z.object({
  REDIS_URL: z.url({ protocol: /^rediss?$/, error: 'must be a redis:// or rediss:// URL' }),
});

/**
 * S3-compatible object storage. The same variables address MinIO (local), Cloudflare R2 or
 * AWS S3 — switching providers is a configuration change, not a code change.
 */
export const storageEnvSchema = z.object({
  S3_ENDPOINT: httpUrl.optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'must be a valid S3 bucket name'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: envBoolean.default(false),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;
export type StorageEnv = z.infer<typeof storageEnvSchema>;
