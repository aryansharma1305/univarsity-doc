import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 14B: browser smoke tests against a RUNNING production-mode staging stack, through Caddy's
 * HTTPS reviewer gate. Nothing is started or prepared here (`deploy/scripts/staging.py` owns the
 * stack). Credentials come from the private, git-ignored `.local/staging` directory.
 *
 * Local stacks use Caddy's internal CA. Chromium trusts only that CA's intermediate key (exported by
 * `staging.py ca`); TLS validation is never disabled. A public host uses its real certificate.
 */
// Phase 14C (Render) keeps its instance in .local/render: STAGING_SECRETS_DIR=render.
const secrets = fileURLToPath(
  new URL(
    `../../.local/${process.env.STAGING_SECRETS_DIR === 'render' ? 'render' : 'staging'}/`,
    import.meta.url,
  ),
);
const instance = JSON.parse(readFileSync(`${secrets}instance.json`, 'utf8')) as {
  origin: string;
  public: boolean;
};
const { gate } = JSON.parse(readFileSync(`${secrets}reviewers.json`, 'utf8')) as {
  gate: { username: string; password: string };
};
const intermediate = `${secrets}local-ca-intermediate.crt`;
const pinnedKey =
  !instance.public && existsSync(intermediate)
    ? createHash('sha256')
        .update(
          new X509Certificate(readFileSync(intermediate)).publicKey.export({
            type: 'spki',
            format: 'der',
          }),
        )
        .digest('base64')
    : null;
if (!instance.public && !pinnedKey)
  throw new Error('Run `python3 deploy/scripts/staging.py ca` before the staging smoke tests');
// API requests use Node's TLS: trust the same local root for this process only (see test:staging).
if (!instance.public && !process.env.NODE_EXTRA_CA_CERTS?.endsWith('local-ca.crt'))
  throw new Error('Set NODE_EXTRA_CA_CERTS to .local/staging/local-ca.crt (pnpm test:staging)');

const use = {
  baseURL: instance.origin,
  httpCredentials: { username: gate.username, password: gate.password, send: 'always' as const },
  launchOptions: pinnedKey ? { args: [`--ignore-certificate-errors-spki-list=${pinnedKey}`] } : {},
  trace: 'retain-on-failure' as const,
};

export default defineConfig({
  testDir: './e2e-staging',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/staging',
  use,
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...use } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...use } },
  ],
});
