import { prepareTestDatabase } from '@docversity/database/testing';
import { S3ObjectStorage } from '@docversity/storage';
import { storageEnvSchema, testStorageBucket } from '@docversity/validation';
import type { TestProject } from 'vitest/node';
import { loadRootEnv } from '../../src/config/load-root-env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    apiTestDatabaseUrl: string;
  }
}

/**
 * API tests use their own disposable database (`<dev db>_api_test`), built from the real migrations,
 * and the dedicated test bucket. If that bucket is missing the run stops here rather than writing to
 * the shared development bucket (re-run `docker compose up -d --wait` with the current init script).
 */
export default async function setup(project: TestProject): Promise<void> {
  loadRootEnv();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL must be set (see .env.example)');
  const bucket = testStorageBucket(process.env);
  const config = storageEnvSchema.parse({ ...process.env, S3_BUCKET: bucket });
  try {
    await new S3ObjectStorage({ config, connectTimeoutMs: 5_000 }).ping();
  } catch (error) {
    throw new Error(
      `Test object-storage bucket "${bucket}" is not reachable. Provision it with docker/minio/init.sh; tests never fall back to "${process.env.S3_BUCKET ?? ''}".`,
      { cause: error },
    );
  }
  project.provide(
    'apiTestDatabaseUrl',
    await prepareTestDatabase({ baseUrl, suffix: '_api_test' }),
  );
}
