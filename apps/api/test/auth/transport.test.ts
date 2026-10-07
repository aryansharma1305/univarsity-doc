import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browser, createTestApp, createTestUser, csrfToken, http, realConfig } from '../helpers.js';

describe('CORS', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp(realConfig({ CORS_ORIGINS: ['http://localhost:3000'] }));
  });
  afterAll(async () => {
    await app.close();
  });

  it('allows the configured origin with credentials (never a wildcard)', async () => {
    const response = await http(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(String(response.headers['access-control-allow-headers'])).toMatch(/X-CSRF-Token/i);
  });

  it('does not allow other origins', async () => {
    const response = await http(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('client IP and proxy trust (rate-limit keys)', () => {
  async function attemptsFromForwardedIps(app: INestApplication, email: string): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const agent = browser(app);
      const token = await csrfToken(agent);
      const response = await agent
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `203.0.113.${i + 1}`)
        .set('X-CSRF-Token', token)
        .send({ email, password: 'wrong password entirely' });
      statuses.push(response.status);
    }
    return statuses;
  }

  it('ignores spoofed X-Forwarded-For when no proxy is trusted', async () => {
    const app = await createTestApp(
      realConfig({ TRUST_PROXY: false, LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP: 2 }),
    );
    try {
      const user = await createTestUser();
      // Different forged IPs do not create fresh buckets: the 3rd attempt is throttled.
      expect(await attemptsFromForwardedIps(app, user.email)).toEqual([401, 401, 429]);
    } finally {
      await app.close();
    }
  });

  it('uses X-Forwarded-For from a trusted proxy (loopback)', async () => {
    const app = await createTestApp(
      realConfig({ TRUST_PROXY: 'loopback', LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP: 2 }),
    );
    try {
      const user = await createTestUser();
      // Each real client IP has its own account+IP bucket.
      expect(await attemptsFromForwardedIps(app, user.email)).toEqual([401, 401, 401]);
    } finally {
      await app.close();
    }
  });
});
