import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  browser,
  createTestApp,
  createTestUser,
  csrfToken,
  errorOf,
  http,
  realConfig,
  sessionsOf,
  setCookie,
  signIn,
} from '../helpers.js';

const config = realConfig({
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP: 3,
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: 50,
});
let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp(config);
});
afterAll(async () => {
  await app.close();
});

async function attempt(agent: ReturnType<typeof browser>, email: string, password: string) {
  const token = await csrfToken(agent);
  return agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email, password });
}

describe('POST /api/v1/auth/login', () => {
  it('signs in, sets an HttpOnly SameSite=Lax session cookie and returns only safe fields', async () => {
    const user = await createTestUser({ roles: ['VIEWER'] });
    const agent = browser(app);
    const response = await attempt(agent, user.email.toUpperCase(), user.password);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: user.id,
      email: user.email,
      displayName: 'Test Staff Member',
      roles: ['VIEWER'],
      permissions: [
        'academicSessions.read',
        'certificates.read',
        'departments.read',
        'programs.read',
        'registrations.read',
        'results.read',
        'students.read',
        'templates.read',
      ],
    });
    const cookie = setCookie(response, 'dv_session');
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Max-Age|Expires/i); // browser-session cookie
    expect(cookie).not.toMatch(/Secure/i); // local http development (COOKIE_SECURE=false)
    expect(response.headers['cache-control']).toBe('no-store');

    const sessionValue = cookie?.split(';')[0]?.split('=')[1] ?? '';
    expect(sessionValue.length).toBeGreaterThanOrEqual(43);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(sessionValue);
    expect(serialized).not.toContain(user.password);
    expect(serialized).not.toMatch(/passwordHash|argon2/i);
  });

  it('uses __Host- prefixed Secure cookies when COOKIE_SECURE=true', async () => {
    const secureApp = await createTestApp(realConfig({ COOKIE_SECURE: true }));
    try {
      const user = await createTestUser();
      const agent = browser(secureApp);
      const csrf = await agent.get('/api/v1/auth/csrf');
      const preAuth = setCookie(csrf, '__Host-dv_csrf');
      expect(preAuth).toMatch(/Secure/);
      expect(preAuth).toMatch(/SameSite=Strict/i);
      const token = (csrf.body as { csrfToken: string }).csrfToken;
      const response = await http(secureApp)
        .post('/api/v1/auth/login')
        .set('Cookie', preAuth?.split(';')[0] ?? '')
        .set('X-CSRF-Token', token)
        .send({ email: user.email, password: user.password });
      expect(response.status).toBe(200);
      const cookie = setCookie(response, '__Host-dv_session');
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).not.toMatch(/Domain=/i);
    } finally {
      await secureApp.close();
    }
  });

  it('returns the same generic failure for a wrong password, an unknown email and a disabled account', async () => {
    const user = await createTestUser();
    const disabled = await createTestUser({ status: 'DISABLED' });
    const passwordless = await createTestUser({ password: null });

    const responses = [
      await attempt(browser(app), user.email, 'wrong password entirely'),
      await attempt(browser(app), 'nobody.here@example.test', TEST_PASSWORD),
      await attempt(browser(app), disabled.email, disabled.password),
      await attempt(browser(app), passwordless.email, TEST_PASSWORD),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(errorOf(response).message).toBe('Unable to sign in with those credentials.');
      expect(setCookie(response, 'dv_session')).toBeUndefined();
    }
    const shapes = responses.map((r) => ({
      status: r.status,
      keys: Object.keys(errorOf(r)).sort(),
    }));
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(1);
  });

  it('rejects login without a valid pre-auth CSRF token', async () => {
    const user = await createTestUser();
    const missing = await http(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(missing.status).toBe(403);
    expect(errorOf(missing).code).toBe('CSRF_INVALID');

    const agent = browser(app);
    await csrfToken(agent);
    const forged = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', 'forged.token-value')
      .send({ email: user.email, password: user.password });
    expect(forged.status).toBe(403);
  });

  it('validates input with the shared schema and never echoes the password', async () => {
    const agent = browser(app);
    const token = await csrfToken(agent);
    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: 'not-an-email', password: 'Sup3r-Secret-Value!' });
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(response.body)).not.toContain('Sup3r-Secret-Value!');
  });

  it('throttles repeated attempts for an account from one client (429 + Retry-After)', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    for (let i = 0; i < 3; i += 1) {
      expect((await attempt(agent, user.email, 'wrong password entirely')).status).toBe(401);
    }
    const limited = await attempt(agent, user.email, user.password); // even the right password
    expect(limited.status).toBe(429);
    expect(errorOf(limited).code).toBe('AUTH_RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('clears the account counters after a successful login', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    for (let i = 0; i < 2; i += 1) await attempt(agent, user.email, 'wrong password entirely');
    expect((await attempt(agent, user.email, user.password)).status).toBe(200);
    for (let i = 0; i < 2; i += 1) {
      expect((await attempt(browser(app), user.email, 'wrong password entirely')).status).toBe(401);
    }
  });

  it('rotates the session on login (session fixation defence)', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    await signIn(agent, user);
    const before = await agent.get('/api/v1/auth/sessions').expect(200);
    const firstId = sessionsOf(before)[0]?.id;

    const sessionCsrf = await csrfToken(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', sessionCsrf)
      .send({ email: user.email, password: user.password })
      .expect(200);
    const after = await agent.get('/api/v1/auth/sessions').expect(200);
    const ids = sessionsOf(after).map((s) => s.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(firstId);
  });
});
