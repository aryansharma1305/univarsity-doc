import { prepareTestDatabase } from '@docversity/database/testing';
import type { TestProject } from 'vitest/node';
import { loadRootEnv } from '../../src/config/load-root-env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    apiTestDatabaseUrl: string;
  }
}

/** API tests use their own disposable database (`<dev db>_api_test`), built from the real migrations. */
export default async function setup(project: TestProject): Promise<void> {
  loadRootEnv();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL must be set (see .env.example)');
  project.provide(
    'apiTestDatabaseUrl',
    await prepareTestDatabase({ baseUrl, suffix: '_api_test' }),
  );
}
