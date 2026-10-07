import type { TestProject } from 'vitest/node';
import { prepareTestDatabase } from '../../src/testing/index.js';
import { loadRootEnv } from '../load-env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/**
 * Creates the disposable `<dev database>_test` database from the real migrations, so schema tests
 * never touch development data.
 */
export default async function setup(project: TestProject): Promise<void> {
  loadRootEnv();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL must be set (see .env.example)');
  project.provide('testDatabaseUrl', await prepareTestDatabase({ baseUrl, suffix: '_test' }));
}
