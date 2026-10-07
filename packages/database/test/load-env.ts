import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Loads the monorepo root .env for local runs; CI provides variables directly. */
export function loadRootEnv(): void {
  const file = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
