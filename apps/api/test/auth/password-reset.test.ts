import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PasswordResetNotifier } from '../../src/auth/password-reset.notifier.js';
import {
  browser,
  createTestApp,
  createTestUser,
  csrfToken,
  errorOf,
  http,
  realConfig,
  signIn,
  testDb,
} from '../helpers.js';

async function postPreAuth(app: INestApplication, path: string, body: object) {
  const agent = browser(app);
  const token = await csrfToken(agent);
  return agent.post(`/api/v1/auth/${path}`).set('X-CSRF-Token', token).send(body);
}

describe('password reset while email delivery is NOT configured', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp(realConfig());
  });
  afterAll(async () => {
    await app.close();
  });

  it('answers 503 for every address instead of pretending an email was sent', async () => {
    const user = await createTestUser();
    for (const email of [user.email, 'unknown.person@example.test']) {
      const response = await postPreAuth(app, 'forgot-password', { email });
      expect(response.status).toBe(503);
      expect(errorOf(response).code).toBe('PASSWORD_RESET_UNAVAILABLE');
    }
  });
});

describe('password reset with a (test) delivery channel', () => {
  const sent: { email: string; resetUrl: string }[] = [];
  const notifier: PasswordResetNotifier = {
    isConfigured: () => true,
    sendResetLink: (input) => {
      sent.push({ email: input.email, resetUrl: input.resetUrl });
      return Promise.resolve();
    },
  };
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp(realConfig({ PASSWORD_RESET_TOKEN_TTL_SECONDS: 60 }), {
      passwordResetNotifier: notifier,
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const tokenFor = (email: string) => {
    const url = sent.filter((m) => m.email === email).at(-1)?.resetUrl ?? '';
    expect(url).toMatch(/\/admin\/reset-password#token=/);
    return decodeURIComponent(url.split('#token=')[1] ?? '');
  };

  it('responds identically for known and unknown emails', async () => {
    const user = await createTestUser();
    const known = await postPreAuth(app, 'forgot-password', { email: user.email });
    const unknown = await postPreAuth(app, 'forgot-password', {
      email: 'nobody.else@example.test',
    });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(sent.some((m) => m.email === 'nobody.else@example.test')).toBe(false);
  });

  it('resets with a single-use token, revokes all sessions, and stores only the token hash', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    await signIn(agent, user);
    await postPreAuth(app, 'forgot-password', { email: user.email });
    const token = tokenFor(user.email);

    // Weak password: rejected WITHOUT consuming the token.
    const weak = await postPreAuth(app, 'reset-password', { token, newPassword: 'password1234' });
    expect(weak.status).toBe(400);

    const newPassword = 'a brand new long passphrase 77';
    await postPreAuth(app, 'reset-password', { token, newPassword }).then((r) => {
      expect(r.status).toBe(200);
    });
    await agent.get('/api/v1/auth/me').expect(401); // all sessions revoked

    const reused = await postPreAuth(app, 'reset-password', {
      token,
      newPassword: 'another long passphrase 88',
    });
    expect(reused.status).toBe(400);
    expect(errorOf(reused).code).toBe('AUTH_INVALID_RESET_TOKEN');

    await signIn(browser(app), { email: user.email, password: newPassword });
    const oldPassword = await postPreAuth(app, 'login', {
      email: user.email,
      password: user.password,
    });
    expect(oldPassword.status).toBe(401);

    const audit = await testDb().auditLog.findFirst({
      where: { action: 'AUTH_PASSWORD_RESET', entityId: user.id },
    });
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it('a newer reset request invalidates the previous token', async () => {
    const user = await createTestUser();
    await postPreAuth(app, 'forgot-password', { email: user.email });
    const first = tokenFor(user.email);
    await postPreAuth(app, 'forgot-password', { email: user.email });
    const response = await postPreAuth(app, 'reset-password', {
      token: first,
      newPassword: 'a brand new long passphrase 77',
    });
    expect(response.status).toBe(400);
  });

  it('rejects unknown tokens', async () => {
    const response = await http(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x'.repeat(43), newPassword: 'x' });
    expect(response.status).toBe(403); // no CSRF token
    const withCsrf = await postPreAuth(app, 'reset-password', {
      token: 'x'.repeat(43),
      newPassword: 'a brand new long passphrase 77',
    });
    expect(withCsrf.status).toBe(400);
  });
});

describe('changing your own password', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp(realConfig());
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires the current password, enforces policy, revokes other sessions and audits', async () => {
    const user = await createTestUser();
    const current = browser(app);
    const other = browser(app);
    const csrf = await signIn(current, user);
    await signIn(other, user);

    await current
      .post('/api/v1/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: 'not my password', newPassword: 'a brand new long passphrase 77' })
      .expect(401);
    const weak = await current
      .post('/api/v1/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: user.password, newPassword: 'short' });
    expect(weak.status).toBe(400);

    await current
      .post('/api/v1/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: user.password, newPassword: 'a brand new long passphrase 77' })
      .expect(200);
    await current.get('/api/v1/auth/me').expect(200);
    await other.get('/api/v1/auth/me').expect(401);
    expect(
      await testDb().auditLog.count({
        where: { action: 'AUTH_PASSWORD_CHANGED', entityId: user.id },
      }),
    ).toBe(1);
  });
});
