import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { importLimitsEnvSchema, uploadRequestBodyLimitBytes } from '@docversity/validation';
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
// It covers the largest upload of any endpoint (historical documents, not only workbooks) plus
// multipart overhead, so the API — not a truncated body — decides and answers oversized files
// with a clear "file too large" message. The reviewer-gate Caddy allows exactly the same size.
const { IMPORT_MAX_FILE_MB } = importLimitsEnvSchema.parse(process.env);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // The design system is consumed as TypeScript source.
  transpilePackages: ['@docversity/ui'],
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    cpus: 2,
    proxyClientMaxBodySize: uploadRequestBodyLimitBytes(IMPORT_MAX_FILE_MB),
  },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
