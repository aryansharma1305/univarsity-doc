import { describe, expect, it } from 'vitest';
import { EnvValidationError } from '@docversity/validation';
import { loadApiConfig } from '../src/config/api-config.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'docversity-local',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  CORS_ORIGINS: 'http://localhost:3000, http://127.0.0.1:3000',
  WEB_URL: 'http://localhost:3000',
  SESSION_SECRET: 'unit-test-secret-unit-test-secret-0123456789',
};

describe('loadApiConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadApiConfig(validEnv);
    expect(config.API_PORT).toBe(4000);
    expect(config.SWAGGER_ENABLED).toBe(false);
    expect(config.S3_FORCE_PATH_STYLE).toBe(false);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });

  it.each([
    'DATABASE_URL',
    'REDIS_URL',
    'S3_BUCKET',
    'S3_SECRET_KEY',
    'CORS_ORIGINS',
    'WEB_URL',
    'SESSION_SECRET',
  ])('fails fast when %s is missing', (name) => {
    const env = Object.fromEntries(Object.entries(validEnv).filter(([key]) => key !== name));
    expect(() => loadApiConfig(env)).toThrow(EnvValidationError);
    expect(() => loadApiConfig(env)).toThrow(name);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadApiConfig({ ...validEnv, DATABASE_URL: 'mysql://x@y/z' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('allows AWS S3 without an explicit endpoint', () => {
    const { S3_ENDPOINT: _omit, ...withoutEndpoint } = validEnv;
    expect(loadApiConfig(withoutEndpoint).S3_ENDPOINT).toBeUndefined();
  });

  it('defaults to secure cookies, 30 min idle and 12 h absolute sessions, and no proxy trust', () => {
    const config = loadApiConfig(validEnv);
    expect(config.COOKIE_SECURE).toBe(true);
    expect(config.SESSION_IDLE_TIMEOUT_SECONDS).toBe(1800);
    expect(config.SESSION_ABSOLUTE_TIMEOUT_SECONDS).toBe(43200);
    expect(config.TRUST_PROXY).toBe(false);
  });

  it('allows insecure cookies only for localhost development', () => {
    expect(loadApiConfig({ ...validEnv, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(() =>
      loadApiConfig({
        ...validEnv,
        COOKIE_SECURE: 'false',
        WEB_URL: 'https://verify.university.test',
      }),
    ).toThrow(/COOKIE_SECURE/);
    expect(() =>
      loadApiConfig({ ...validEnv, COOKIE_SECURE: 'false', NODE_ENV: 'production' }),
    ).toThrow(/COOKIE_SECURE: must be true in production/);
  });

  it('rejects short secrets and the development placeholder in production', () => {
    expect(() => loadApiConfig({ ...validEnv, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(() =>
      loadApiConfig({
        ...validEnv,
        NODE_ENV: 'production',
        SESSION_SECRET: 'dev-only-session-secret-change-me-0123456789abcdef',
      }),
    ).toThrow(/SESSION_SECRET: must be a real random secret/);
  });

  it('requires a real staff-MFA encryption key in production and under enforcement', () => {
    const key = 'a1'.repeat(32);
    const production = {
      ...validEnv,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      WEB_URL: 'https://verify.university.test',
      CORS_ORIGINS: 'https://verify.university.test',
    };
    expect(() => loadApiConfig(production)).toThrow(/STAFF_MFA_ENCRYPTION_KEY: is required/);
    expect(() => loadApiConfig({ ...production, STAFF_MFA_ENCRYPTION_KEY: '' })).toThrow(
      /STAFF_MFA_ENCRYPTION_KEY/,
    );
    expect(() =>
      loadApiConfig({ ...production, STAFF_MFA_ENCRYPTION_KEY: 'f'.repeat(64) }),
    ).toThrow(/STAFF_MFA_ENCRYPTION_KEY: must be a real random key/);
    expect(() =>
      loadApiConfig({ ...production, STAFF_MFA_ENCRYPTION_KEY: 'zz'.repeat(32) }),
    ).toThrow(/64 hexadecimal/);
    expect(loadApiConfig({ ...production, STAFF_MFA_ENCRYPTION_KEY: key }).STAFF_MFA_ENFORCED).toBe(
      false,
    );
    // Development may run without MFA, but not with enforcement switched on.
    expect(loadApiConfig(validEnv).STAFF_MFA_ENCRYPTION_KEY).toBeUndefined();
    expect(() => loadApiConfig({ ...validEnv, STAFF_MFA_ENFORCED: 'true' })).toThrow(
      /STAFF_MFA_ENCRYPTION_KEY/,
    );
    expect(
      loadApiConfig({ ...validEnv, STAFF_MFA_ENFORCED: 'true', STAFF_MFA_ENCRYPTION_KEY: key })
        .STAFF_MFA_ENFORCED,
    ).toBe(true);
  });

  it('refuses a staff-MFA key equal to SESSION_SECRET (independent secrets)', () => {
    const shared = 'b2'.repeat(32);
    expect(() =>
      loadApiConfig({ ...validEnv, SESSION_SECRET: shared, STAFF_MFA_ENCRYPTION_KEY: shared }),
    ).toThrow(/STAFF_MFA_ENCRYPTION_KEY: must not equal SESSION_SECRET/);
    expect(() =>
      loadApiConfig({
        ...validEnv,
        SESSION_SECRET: shared,
        STAFF_MFA_ENCRYPTION_KEY: shared.toUpperCase(),
      }),
    ).toThrow(/must not equal SESSION_SECRET/);
    expect(
      loadApiConfig({
        ...validEnv,
        SESSION_SECRET: shared,
        STAFF_MFA_ENCRYPTION_KEY: 'c3'.repeat(32),
      }).STAFF_MFA_ENCRYPTION_KEY,
    ).toBe('c3'.repeat(32));
  });

  it('applies dedicated, tighter MFA limits and a 24-hour escalating lockout by default', () => {
    const config = loadApiConfig(validEnv);
    expect(config).toMatchObject({
      MFA_RATE_LIMIT_WINDOW_SECONDS: 900,
      MFA_MAX_ATTEMPTS_PER_ACCOUNT_IP: 5,
      MFA_MAX_ATTEMPTS_PER_ACCOUNT: 5,
      MFA_MAX_ATTEMPTS_PER_IP: 50,
      MFA_LOCKOUT_THRESHOLD: 10,
      MFA_LOCKOUT_WINDOW_SECONDS: 86_400,
      MFA_LOCKOUT_SECONDS: 86_400,
    });
    expect(config.MFA_MAX_ATTEMPTS_PER_ACCOUNT).toBeLessThan(config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT);
    expect(
      loadApiConfig({ ...validEnv, MFA_MAX_ATTEMPTS_PER_ACCOUNT: '3' })
        .MFA_MAX_ATTEMPTS_PER_ACCOUNT,
    ).toBe(3);
    expect(() => loadApiConfig({ ...validEnv, MFA_MAX_ATTEMPTS_PER_ACCOUNT: '0' })).toThrow(
      /MFA_MAX_ATTEMPTS_PER_ACCOUNT/,
    );
    expect(() =>
      loadApiConfig({
        ...validEnv,
        MFA_RATE_LIMIT_WINDOW_SECONDS: '3600',
        MFA_LOCKOUT_WINDOW_SECONDS: '600',
      }),
    ).toThrow(/MFA_LOCKOUT_WINDOW_SECONDS/);
  });

  it('never trusts every proxy, but accepts explicit proxy settings', () => {
    expect(() => loadApiConfig({ ...validEnv, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(loadApiConfig({ ...validEnv, TRUST_PROXY: 'loopback' }).TRUST_PROXY).toBe('loopback');
    expect(loadApiConfig({ ...validEnv, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(
      loadApiConfig({ ...validEnv, TRUST_PROXY: '10.0.0.0/8, 192.168.1.10' }).TRUST_PROXY,
    ).toBe('10.0.0.0/8,192.168.1.10');
    expect(() => loadApiConfig({ ...validEnv, TRUST_PROXY: 'everyone' })).toThrow(/TRUST_PROXY/);
  });

  it('requires the absolute session lifetime to be at least the idle timeout', () => {
    expect(() =>
      loadApiConfig({
        ...validEnv,
        SESSION_IDLE_TIMEOUT_SECONDS: '3600',
        SESSION_ABSOLUTE_TIMEOUT_SECONDS: '60',
      }),
    ).toThrow(/SESSION_ABSOLUTE_TIMEOUT_SECONDS/);
  });
});
