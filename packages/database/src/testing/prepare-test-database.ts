import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../client.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'postgres']);

export interface PrepareTestDatabaseOptions {
  /** A connection string for the server; its database is only used to issue CREATE/DROP. */
  baseUrl: string;
  /** Suffix appended to the base database name, e.g. "_test", "_api_test", "_e2e". */
  suffix: `_${string}`;
}

/**
 * Recreates a disposable database named `<base database><suffix>` and applies the real migrations
 * with `prisma migrate deploy`. Returns its connection string.
 *
 * Safety: the name must end with the suffix, contain only [a-z0-9_], and the server must be local
 * (or the CI environment variable must be set).
 */
export function prepareTestDatabase({
  baseUrl,
  suffix,
}: PrepareTestDatabaseOptions): Promise<string> {
  return prepare(baseUrl, suffix);
}

async function prepare(baseUrl: string, suffix: string): Promise<string> {
  const url = new URL(baseUrl);
  const name = `${url.pathname.slice(1)}${suffix}`;
  if (!/^[a-z0-9_]+$/.test(name) || !name.endsWith(suffix) || suffix.length < 2) {
    throw new Error(`Refusing to use test database name "${name}"`);
  }
  if (!LOCAL_HOSTS.has(url.hostname) && !process.env.CI) {
    throw new Error(`Refusing to recreate a test database on non-local host ${url.hostname}`);
  }

  const admin = createPrismaClient({ connectionString: baseUrl });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }

  const testUrl = new URL(baseUrl);
  testUrl.pathname = `/${name}`;
  // This file is compiled to dist/testing/, so the package root is two levels up.
  const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: testUrl.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
  return testUrl.toString();
}
