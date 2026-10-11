import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild (Vite's default transformer) does not emit decorator metadata, which NestJS
  // dependency injection needs. SWC does.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // Files share one disposable database; unrelated fixtures must not overlap.
    // Explicit concurrency within each test still exercises transaction races.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
