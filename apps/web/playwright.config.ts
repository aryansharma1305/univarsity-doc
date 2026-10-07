import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against PRODUCTION builds of the web app and API on dedicated ports (3100/4100),
 * so they never collide with `pnpm dev` (3000/4000), and against a disposable `<dev db>_e2e`
 * database created before the API starts. PostgreSQL, Redis and MinIO must be running
 * (`docker compose up -d --wait`). The root `pnpm test:e2e` builds everything first.
 */
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const WEB_PORT = 3100;
const API_PORT = 4100;
const isCI = Boolean(process.env.CI);

const baseDatabaseUrl = process.env.DATABASE_URL ?? '';
const e2eDatabaseUrl = (() => {
  if (!baseDatabaseUrl) return '';
  const url = new URL(baseDatabaseUrl);
  url.pathname = `${url.pathname}_e2e`;
  return url.toString();
})();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/prepare-e2e.mjs && node ../api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: {
        E2E_BASE_DATABASE_URL: baseDatabaseUrl,
        DATABASE_URL: e2eDatabaseUrl,
        API_PORT: String(API_PORT),
        API_HOST: '127.0.0.1',
        WEB_URL: `http://127.0.0.1:${WEB_PORT}`,
        CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
        SWAGGER_ENABLED: 'false',
        REDIS_KEY_PREFIX: 'dve2e:',
        LOG_LEVEL: 'warn',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
