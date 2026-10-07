import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { createPrismaClient } from '../../src/index.js';
import { loadRootEnv } from '../load-env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'postgres']);

/**
 * Creates a dedicated, disposable test database (`<dev database>_test`) and applies the real
 * migrations to it, so schema tests never touch development data and always run against exactly
 * what `prisma migrate deploy` produces in production.
 */
export default async function setup(project: TestProject): Promise<void> {
  loadRootEnv();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL must be set (see .env.example)');

  const url = new URL(baseUrl);
  const testDatabase = `${url.pathname.slice(1)}_test`;
  // Safety: only ever recreate a *_test database, and only on a local server (or in CI).
  if (!testDatabase.endsWith('_test') || !/^[a-z0-9_]+$/.test(testDatabase)) {
    throw new Error(`Refusing to use test database name "${testDatabase}"`);
  }
  if (!LOCAL_HOSTS.has(url.hostname) && !process.env.CI) {
    throw new Error(`Refusing to recreate a test database on non-local host ${url.hostname}`);
  }

  const admin = createPrismaClient({ connectionString: baseUrl });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDatabase}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${testDatabase}"`);
  } finally {
    await admin.$disconnect();
  }

  const testUrl = new URL(baseUrl);
  testUrl.pathname = `/${testDatabase}`;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testUrl.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });

  project.provide('testDatabaseUrl', testUrl.toString());
}
