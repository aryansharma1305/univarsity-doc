import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { importLimitsEnvSchema } from '@docversity/validation';
import { loadWebEnv } from './src/lib/env';

// Local development keeps a single .env at the monorepo root. Variables already present in the
// environment (CI, containers) are never overridden.
const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// Fail fast on `next dev`, `next build` and `next start` if required variables are missing.
loadWebEnv();

// The same-origin proxy buffers request bodies up to this size before forwarding them to the API.
// It must exceed the API's upload limit (plus multipart overhead) so the API — not a truncated
// body — decides, and answers oversized workbooks with a clear "file too large" message.
const { IMPORT_MAX_FILE_MB } = importLimitsEnvSchema.parse(process.env);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The design system is consumed as TypeScript source.
  transpilePackages: ['@docversity/ui'],
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    proxyClientMaxBodySize: (IMPORT_MAX_FILE_MB + 1) * 1024 * 1024,
  },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
