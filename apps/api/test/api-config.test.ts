import { describe, expect, it } from 'vitest';
import { EnvValidationError } from '@docversity/validation';
import { loadApiConfig, RAZORPAY_LIVE_APPROVAL_REF } from '../src/config/api-config.js';

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

describe('Razorpay payment configuration (synthetic values only)', () => {
  const testMode = {
    ...validEnv,
    PAYMENTS_RAZORPAY_MODE: 'test',
    DOCVERSITY_DEPLOYMENT: 'staging-14c',
    PAYMENTS_ALLOWED_DEPLOYMENT: 'staging-14c',
    RAZORPAY_KEY_ID: 'rzp_test_SYNTHETIC',
    RAZORPAY_KEY_SECRET: 'synthetic-key-secret-0000',
    RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret-00000000000000',
    RAZORPAY_ACCOUNT_ID: 'acc_Synthetic',
    PAYMENTS_TEST_REGISTRATION_ALLOWLIST: '0193a8f0-1111-7222-8333-444455556666',
  };

  it('defaults to off and boots without any Razorpay variable', () => {
    const config = loadApiConfig(validEnv);
    expect(config.PAYMENTS_RAZORPAY_MODE).toBe('off');
    expect(config.RAZORPAY_WEBHOOK_SECRET).toBeUndefined();
    expect(config.PAYMENTS_TEST_REGISTRATION_ALLOWLIST).toEqual([]);
    expect(loadApiConfig({ ...validEnv, RAZORPAY_KEY_ID: '' }).PAYMENTS_RAZORPAY_MODE).toBe('off');
  });

  it.each([
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'RAZORPAY_ACCOUNT_ID',
  ])('(a) refuses to start when mode is off and %s is set', (key) => {
    const env = { ...validEnv, [key]: testMode[key as keyof typeof testMode] };
    expect(() => loadApiConfig(env)).toThrow(new RegExp(`${key}: must not be set`));
  });

  it('accepts a complete test-mode configuration', () => {
    const config = loadApiConfig(testMode);
    expect(config.PAYMENTS_RAZORPAY_MODE).toBe('test');
    expect(config.PAYMENTS_TEST_REGISTRATION_ALLOWLIST).toEqual([
      '0193a8f0-1111-7222-8333-444455556666',
    ]);
  });

  it.each([
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'RAZORPAY_ACCOUNT_ID',
    'PAYMENTS_TEST_REGISTRATION_ALLOWLIST',
  ])('(b) refuses test mode without %s', (key) => {
    const env = Object.fromEntries(Object.entries(testMode).filter(([name]) => name !== key));
    expect(() => loadApiConfig(env)).toThrow(key);
  });

  it('(c) refuses a live key id in test mode', () => {
    expect(() => loadApiConfig({ ...testMode, RAZORPAY_KEY_ID: 'rzp_live_SYNTHETIC' })).toThrow(
      /RAZORPAY_KEY_ID: a live key id is refused in test mode/,
    );
  });

  it('(d) refuses live mode while no approval reference exists, even with an approval value set', () => {
    expect(RAZORPAY_LIVE_APPROVAL_REF).toBeNull();
    for (const approval of [undefined, 'ADR-0099', 'null'])
      expect(() =>
        loadApiConfig({
          ...testMode,
          PAYMENTS_RAZORPAY_MODE: 'live',
          RAZORPAY_KEY_ID: 'rzp_live_SYNTHETIC',
          PAYMENTS_RAZORPAY_LIVE_APPROVAL: approval,
        }),
      ).toThrow(/live mode is not approved/);
  });

  it('(e) refuses a deployment that is not explicitly allowed', () => {
    expect(() => loadApiConfig({ ...testMode, DOCVERSITY_DEPLOYMENT: 'production' })).toThrow(
      /DOCVERSITY_DEPLOYMENT/,
    );
    const { DOCVERSITY_DEPLOYMENT: _d, ...unset } = testMode;
    expect(() => loadApiConfig(unset)).toThrow(/DOCVERSITY_DEPLOYMENT/);
  });

  it('(f) refuses a webhook secret reused from the key secret, SESSION_SECRET or the MFA key', () => {
    const mfa = 'ab'.repeat(32);
    for (const secret of [
      testMode.RAZORPAY_KEY_SECRET.padEnd(32, '0'),
      validEnv.SESSION_SECRET,
      mfa,
    ])
      expect(() =>
        loadApiConfig({
          ...testMode,
          RAZORPAY_KEY_SECRET: testMode.RAZORPAY_KEY_SECRET.padEnd(32, '0'),
          STAFF_MFA_ENCRYPTION_KEY: mfa,
          RAZORPAY_WEBHOOK_SECRET: secret,
        }),
      ).toThrow(/RAZORPAY_WEBHOOK_SECRET: must differ/);
  });

  it('rejects malformed key ids, account ids and allowlist entries', () => {
    expect(() => loadApiConfig({ ...testMode, RAZORPAY_KEY_ID: 'sk_test_x' })).toThrow(
      /RAZORPAY_KEY_ID/,
    );
    expect(() => loadApiConfig({ ...testMode, RAZORPAY_ACCOUNT_ID: 'merchant' })).toThrow(
      /RAZORPAY_ACCOUNT_ID/,
    );
    expect(() =>
      loadApiConfig({ ...testMode, PAYMENTS_TEST_REGISTRATION_ALLOWLIST: 'not-a-uuid' }),
    ).toThrow(/PAYMENTS_TEST_REGISTRATION_ALLOWLIST/);
  });

  it('never echoes a secret value in the startup error', () => {
    const error = (() => {
      try {
        loadApiConfig({ ...validEnv, RAZORPAY_WEBHOOK_SECRET: testMode.RAZORPAY_WEBHOOK_SECRET });
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(error?.message).toMatch(/RAZORPAY_WEBHOOK_SECRET/);
    expect(error?.message).not.toContain(testMode.RAZORPAY_WEBHOOK_SECRET);
  });
});
