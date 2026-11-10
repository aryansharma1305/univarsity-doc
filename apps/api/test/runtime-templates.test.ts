import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadApiConfig } from '../src/config/api-config.js';

function template(name: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(new URL(`../../../deploy/env/${name}.env.example`, import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const split = line.indexOf('=');
        if (split < 1) throw new Error('Invalid reference environment line.');
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
}

describe('production-mode synthetic review environment templates', () => {
  it('refuses the incomplete API example rather than starting with placeholder secrets', () => {
    expect(() => loadApiConfig(template('api'))).toThrow();
  });
  it('accepts independently supplied synthetic credentials and preserves secure-cookie/proxy boundaries', () => {
    const values = {
      ...template('api'),
      SESSION_SECRET: 'synthetic-template-session-key-0000000000000000',
      DATABASE_URL: 'postgresql://synthetic:synthetic-only@postgres:5432/docversity_staging',
      REDIS_URL: 'redis://docversity:synthetic-only@redis:6379',
      S3_ACCESS_KEY: 'synthetic-app',
      S3_SECRET_KEY: 'synthetic-storage-secret-000000000000',
    };
    expect(loadApiConfig(values)).toMatchObject({
      NODE_ENV: 'production',
      COOKIE_SECURE: true,
      TRUST_PROXY: 2,
      SWAGGER_ENABLED: false,
    });
    expect(() => loadApiConfig({ ...values, COOKIE_SECURE: 'false' })).toThrow();
    expect(() => loadApiConfig({ ...values, TRUST_PROXY: 'true' })).toThrow();
    expect(() =>
      loadApiConfig({ ...values, SESSION_SECRET: 'dev-only-unsafe-placeholder-secret-00000' }),
    ).toThrow();
  });
  it('keeps database/storage/session secrets out of web and session-signing authority out of worker', () => {
    const web = template('web');
    const worker = template('worker');
    for (const key of [
      'DATABASE_URL',
      'REDIS_URL',
      'SESSION_SECRET',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
    ])
      expect(web).not.toHaveProperty(key);
    expect(worker).not.toHaveProperty('SESSION_SECRET');
    expect(web.API_INTERNAL_URL).toBe('http://api:4000');
    expect(web.WEB_BEHIND_TRUSTED_PROXY).toBe('true');
  });
});

describe('production service launcher in an isolated process', () => {
  function launch(contents: string, code: string) {
    const scratch = mkdtempSync(join(tmpdir(), 'synthetic-launch-'));
    try {
      const runtime = join(scratch, 'runtime');
      writeFileSync(runtime, contents, { mode: 0o600 });
      return spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../../../deploy/scripts/launch.mjs', import.meta.url)),
          process.execPath,
          '-e',
          code,
        ],
        {
          cwd: scratch,
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 16384,
          env: {
            PATH: '/usr/local/bin:/usr/bin:/bin',
            HOME: scratch,
            TMPDIR: scratch,
            RUNTIME_ENV_FILE: runtime,
          },
        },
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  it('injects private runtime values into the child without printing them and preserves exit codes', () => {
    const result = launch(
      '# synthetic only\nSYNTHETIC_VALUE=SYN-NOT-A-REAL-SECRET\n',
      'process.exit(process.env.SYNTHETIC_VALUE === "SYN-NOT-A-REAL-SECRET" ? 17 : 99)',
    );
    expect(result.status).toBe(17);
    expect(result.stdout + result.stderr).toBe('');
    expect(result.error).toBeUndefined();
  });
  it('refuses malformed runtime files before starting the application', () => {
    const result = launch('SYNTHETIC-NOT-A-VALID-LINE\n', 'console.log("CHILD_STARTED")');
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('CHILD_STARTED');
    expect(result.stderr).not.toContain('SYNTHETIC-NOT-A-VALID-LINE');
  });
});
