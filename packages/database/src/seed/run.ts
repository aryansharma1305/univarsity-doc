/**
 * Seeds DEVELOPMENT FIXTURES into the database at DATABASE_URL.
 *
 *   pnpm db:seed
 *
 * Refuses to run when NODE_ENV=production or when the database host is not local, unless
 * DOCVERSITY_ALLOW_DEV_SEED=true is set explicitly (e.g. for a disposable staging database).
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../client.js';
import { DEV_FIXTURE_LABEL, seedDevelopmentFixtures } from './development-fixtures.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'postgres']);

const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set (see .env.example).');
  process.exit(1);
}

const host = new URL(databaseUrl).hostname;
const override = process.env.DOCVERSITY_ALLOW_DEV_SEED === 'true';
if (process.env.NODE_ENV === 'production' || (!LOCAL_HOSTS.has(host) && !override)) {
  console.error(
    `Refusing to seed development fixtures (NODE_ENV=${process.env.NODE_ENV ?? 'unset'}, host=${host}).`,
  );
  process.exit(1);
}

const db = createPrismaClient({ connectionString: databaseUrl });
try {
  const summary = await seedDevelopmentFixtures(db);
  console.log(`Seeded ${DEV_FIXTURE_LABEL.toLowerCase()}:`, summary);
} catch (error) {
  console.error('Seeding failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
