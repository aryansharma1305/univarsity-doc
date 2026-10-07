import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests run against PRODUCTION builds of the web app and API on dedicated ports,
 * so they never collide with `pnpm dev` (3000/4000). PostgreSQL, Redis and MinIO must be running
 * (`docker compose up -d --wait`). Build first: `pnpm build` (the root `test:e2e` task does this).
 */
const WEB_PORT = 3100;
const API_PORT = 4100;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
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
      command: 'node ../api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: { API_PORT: String(API_PORT), API_HOST: '127.0.0.1', SWAGGER_ENABLED: 'false' },
      reuseExistingServer: false,
      timeout: 60_000,
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
