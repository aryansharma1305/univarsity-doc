import { defineConfig } from '@playwright/test';

/** Frontend-only checks: synthetic browser inputs, no database, storage, or live API. */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['public.spec.ts', 'public-verification.spec.ts'],
  grepInvert: /all four real API contracts/,
  workers: 1,
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:3190', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec next start --port 3190 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3190',
    env: { API_INTERNAL_URL: 'http://127.0.0.1:9' },
    reuseExistingServer: false,
  },
});
