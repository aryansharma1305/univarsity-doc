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

/**
 * Object-storage bucket for automated tests (API integration tests, e2e API and worker). Tests must
 * never write into the development bucket shared with `pnpm dev` and other worktrees: the bucket is
 * `S3_TEST_BUCKET`, or `<S3_BUCKET>-test` when unset, and is refused if it equals `S3_BUCKET`.
 * `docker/minio/init.sh` provisions it locally and in CI with the same bucket-scoped app policy.
 */
export function testStorageBucket(env: Readonly<Record<string, string | undefined>>): string {
  const base = env.S3_BUCKET;
  // An empty S3_TEST_BUCKET means "not set", so fall back to the derived name.
  const configured = env.S3_TEST_BUCKET?.trim() ? env.S3_TEST_BUCKET.trim() : undefined;
  const bucket = configured ?? (base ? `${base}-test` : '');
  const valid = storageEnvSchema.shape.S3_BUCKET.safeParse(bucket);
  if (!valid.success) throw new Error('S3_TEST_BUCKET (or S3_BUCKET) is not a valid bucket name.');
  if (bucket === base)
    throw new Error(
      'S3_TEST_BUCKET must differ from S3_BUCKET: tests must not write to the development bucket.',
    );
  return bucket;
}
