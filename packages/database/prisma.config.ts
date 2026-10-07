import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env files itself. Load the monorepo root .env for local development;
// variables already present in the environment (CI, containers) always take precedence.
const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Development fixtures only; the runner refuses production / non-local databases.
    // Requires a build first (`pnpm db:seed` at the root handles that).
    seed: 'node dist/seed/run.js',
  },
  datasource: {
    // Not every command needs a database (e.g. `prisma generate`), so a missing URL is only an error
    // for commands that actually connect — Prisma reports it at that point.
    url: process.env.DATABASE_URL ?? '',
  },
});
