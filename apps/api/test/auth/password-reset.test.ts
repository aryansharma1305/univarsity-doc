import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomToken, sha256 } from '../../src/auth/identifier-hasher.js';
import type { PasswordResetNotifier } from '../../src/auth/password-reset.notifier.js';
import { PasswordResetStore } from '../../src/auth/password-reset.store.js';
import { PasswordService } from '../../src/auth/password.service.js';
import { resetStaffAccess } from '../../src/cli/reset-staff-access-core.js';
import { API_CONFIG, type ApiConfig } from '../../src/config/api-config.js';
import { RedisService } from '../../src/redis/redis.service.js';
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

  it('binds each reset link to the credential in effect at issuance', async () => {
    const user = await createTestUser();
    await postPreAuth(app, 'forgot-password', { email: user.email });
    const token = tokenFor(user.email);
    const binding = await app.get(PasswordResetStore).peek(token);
    expect(binding?.userId).toBe(user.id);
    expect(binding?.credentialVersion).toMatch(/^[a-f0-9]{64}$/);
  });

  const temporaryPassword = 'operator temporary handover phrase 27';
  const nextPassword = 'staff chosen replacement passphrase 17';

  async function requestLink(email: string) {
    const response = await postPreAuth(app, 'forgot-password', { email });
    expect(response.status).toBe(202);
    return tokenFor(email);
  }

  async function expectInvalidLink(token: string) {
    const response = await postPreAuth(app, 'reset-password', { token, newPassword: nextPassword });
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('AUTH_INVALID_RESET_TOKEN');
  }

  it('rejects legacy reset links without credential bindings', async () => {
    const user = await createTestUser();
    const token = randomToken();
    const prefix = app.get<ApiConfig>(API_CONFIG).REDIS_KEY_PREFIX;
    await app.get(RedisService).client.set(`${prefix}pwreset:${sha256(token)}`, user.id, 'EX', 60);
    await expectInvalidLink(token);
  });

  it('rejects every prior link after emergency reset and leaves another account alone', async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const earlier = await requestLink(user.email);
    const latest = await requestLink(user.email);
    const otherLink = await requestLink(other.email);
    const db = testDb();
    const otherBefore = await db.user.findUniqueOrThrow({ where: { id: other.id } });

    await resetStaffAccess(db, { email: ` ${user.email.toUpperCase()} `, temporaryPassword });
    await expectInvalidLink(earlier);
    await expectInvalidLink(latest);
    expect(await db.user.findUniqueOrThrow({ where: { id: other.id } })).toEqual(otherBefore);
    expect(await app.get(PasswordResetStore).peek(otherLink)).toMatchObject({ userId: other.id });

    const before = sent.length;
    const response = await postPreAuth(app, 'forgot-password', { email: user.email });
    const unknown = await postPreAuth(app, 'forgot-password', { email: 'unknown@example.test' });
    expect(response.status).toBe(202);
    expect(response.body).toEqual(unknown.body);
    expect(sent).toHaveLength(before);
  });

  it('rejects a link issued by an in-flight request even after the password handover finishes', async () => {
    const user = await createTestUser();
    const resets = app.get(PasswordResetStore);
    const issue = resets.issue.bind(resets);
    const pending = vi.spyOn(resets, 'issue').mockImplementationOnce(async (credential) => {
      await resetStaffAccess(testDb(), { email: user.email, temporaryPassword });
      return issue(credential);
    });
    let link: string;
    try {
      link = await requestLink(user.email);
    } finally {
      pending.mockRestore();
    }

    const agent = browser(app);
    const csrf = await signIn(agent, { email: user.email, password: temporaryPassword });
    await agent
      .post('/api/v1/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: temporaryPassword, newPassword: nextPassword })
      .expect(200);
    await expectInvalidLink(link);

    const freshLink = await requestLink(user.email);
    const fresh = await postPreAuth(app, 'reset-password', {
      token: freshLink,
      newPassword: 'later normal email recovery phrase 17',
    });
    expect(fresh.status).toBe(200);
  });

  it('does not let an in-flight password reset overwrite a committed emergency reset', async () => {
    const user = await createTestUser();
    const link = await requestLink(user.email);
    const passwords = app.get(PasswordService);
    const hash = passwords.hashPassword.bind(passwords);
    const pending = vi.spyOn(passwords, 'hashPassword').mockImplementationOnce(async (password) => {
      await resetStaffAccess(testDb(), { email: user.email, temporaryPassword });
      return hash(password);
    });
    try {
      await expectInvalidLink(link);
    } finally {
      pending.mockRestore();
    }
    const row = await testDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordChangeRequired).toBe(true);
    expect(await passwords.verifyPassword(row.passwordHash ?? '', temporaryPassword)).toBe(true);
  });

  it('keeps the old credential binding when the emergency reset audit write rolls back', async () => {
    const user = await createTestUser();
    const link = await requestLink(user.email);
    const db = testDb();
    const before = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    // Force a real failure after the credential writes, using only the disposable API database.
    await db.$executeRaw`
      ALTER TABLE audit_logs ADD CONSTRAINT test_reject_cli_audit
      CHECK (action <> 'STAFF_ACCESS_RESET') NOT VALID
    `;
    try {
      await expect(resetStaffAccess(db, { email: user.email, temporaryPassword })).rejects.toThrow(
        /test_reject_cli_audit/,
      );
    } finally {
      await db.$executeRaw`ALTER TABLE audit_logs DROP CONSTRAINT test_reject_cli_audit`;
    }
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
    const response = await postPreAuth(app, 'reset-password', {
      token: link,
      newPassword: nextPassword,
    });
    expect(response.status).toBe(200);
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
