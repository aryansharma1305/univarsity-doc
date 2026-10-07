// Runs before the e2e API server starts (see playwright.config.ts):
//   1. recreates the disposable `<dev db>_e2e` database from the real migrations;
//   2. creates a SUPER_ADMIN through the same code path as `pnpm admin:create`, with a RANDOM
//      password written to a git-ignored file for the browser test. No credentials are hard-coded.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@docversity/database';
import { prepareTestDatabase } from '@docversity/database/testing';
import { createAdmin } from '../../api/dist/cli/create-admin-core.js';

const baseUrl = process.env.E2E_BASE_DATABASE_URL;
if (!baseUrl) throw new Error('E2E_BASE_DATABASE_URL is required');

const databaseUrl = await prepareTestDatabase({ baseUrl, suffix: '_e2e' });
const credentials = {
  email: `e2e.admin.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Test Admin',
};
const db = createPrismaClient({ connectionString: databaseUrl });
try {
  await createAdmin(db, credentials);
} finally {
  await db.$disconnect();
}

const dir = fileURLToPath(new URL('../.e2e/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}credentials.json`, JSON.stringify(credentials), { mode: 0o600 });
console.log('e2e database and admin fixture ready');
