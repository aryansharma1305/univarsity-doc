import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { authUserSchema, mfaEnrollmentStartResponseSchema } from '@docversity/validation';
import { base32Decode, hotp, totpStep } from '../../src/auth/totp.js';
import { createAdmin } from '../../src/cli/create-admin-core.js';
import { resetStaffAccess } from '../../src/cli/reset-staff-access-core.js';
import type { ApiConfig } from '../../src/config/api-config.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { StaffUsersService } from '../../src/users/staff-users.service.js';
import { SessionStore } from '../../src/auth/session.store.js';
import {
  browser,
  createTestApp,
  createTestUser,
  csrfToken,
  errorOf,
  http,
  realConfig,
  setCookie,
  signIn,
  TEST_PASSWORD,
  testDb,
  type TestUser,
  userOf,
} from '../helpers.js';

type Agent = ReturnType<typeof browser>;

let app: INestApplication;
let config: ApiConfig;

beforeAll(async () => {
  config = realConfig();
  app = await createTestApp(config);
});
afterAll(async () => {
  await app.close();
});

const NEW_PASSWORD = 'a brand new staff passphrase 2027';
const email = () => `mfa.${randomUUID().slice(0, 8)}@example.test`;

type Sent = Awaited<ReturnType<Agent['get']>>;

/** A pending request that also offers `.expect(status)` (resolving to the response). */
function expectable(pending: Promise<Sent>) {
  return Object.assign(pending, {
    expect: async (status: number) => {
      const response = await pending;
      expect(response.status, JSON.stringify(response.body)).toBe(status);
      return response;
    },
  });
}

const TEMPORARY_PASSWORD = 'temporary handover phrase 9931';

function login(agent: Agent, user: Pick<TestUser, 'email' | 'password'>) {
  return expectable(
    (async () => {
      const token = await csrfToken(agent);
      return agent
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', token)
        .send({ email: user.email, password: user.password });
    })(),
  );
}

function post(agent: Agent, path: string, body?: object) {
  return expectable(
    (async () => {
      const token = await csrfToken(agent);
      return agent.post(`/api/v1/${path}`).set('X-CSRF-Token', token).send(body);
    })(),
  );
}

/** A code for a given offset from the current step (+1 is accepted and beats any earlier step). */
function codeFor(secret: string, offset = 0): string {
  return hotp(base32Decode(secret), totpStep(Date.now()) + offset);
}

/** Enrolls MFA for a signed-in agent; returns the base32 secret and the recovery codes. */
async function enroll(agent: Agent, currentPassword = TEST_PASSWORD) {
  const started = await post(agent, 'auth/mfa/enrollment');
  expect(started.status).toBe(200);
  const { secret } = mfaEnrollmentStartResponseSchema.parse(started.body);
  const confirmed = await post(agent, 'auth/mfa/enrollment/confirm', {
    currentPassword,
    code: codeFor(secret),
  });
  expect(confirmed.status).toBe(200);
  return { secret, recoveryCodes: (confirmed.body as { recoveryCodes: string[] }).recoveryCodes };
}

/** A user with MFA enabled; returns them signed out, with their secret and recovery codes. */
async function mfaUser(
  roles: ('SUPER_ADMIN' | 'REGISTRAR' | 'EXAM_ADMIN')[] = ['REGISTRAR'],
  target: INestApplication = app,
) {
  const user = await createTestUser({ roles });
  const agent = browser(target);
  await signIn(agent, user);
  const enrollment = await enroll(agent);
  return { user, ...enrollment };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('first-login password change (CLI-created accounts)', () => {
  it('restricts the session to password change, me, csrf and logout until the password changes', async () => {
    const password = 'operator chosen bootstrap 2026';
    const created = await createAdmin(testDb(), {
      email: email(),
      displayName: 'Bootstrap Registrar',
      password,
      role: 'REGISTRAR',
    });
    const user = { email: created.email, password };
    const agent = browser(app);
    const other = browser(app);

    const response = await login(agent, user);
    expect(response.status).toBe(200);
    const body = userOf(response);
    expect(body.nextStep).toBe('PASSWORD_CHANGE');
    expect(body.permissions).toEqual([]);
    await login(other, user).expect(200);

    // me + csrf work and report the step; nothing else does.
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(userOf(me)).toMatchObject({ nextStep: 'PASSWORD_CHANGE', permissions: [] });
    for (const path of ['departments', 'students', 'auth/sessions', 'staff-users']) {
      const blocked = await agent.get(`/api/v1/${path}`);
      expect(blocked.status, path).toBe(403);
      expect(errorOf(blocked).code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    const enrollBlocked = await post(agent, 'auth/mfa/enrollment');
    expect(errorOf(enrollBlocked).code).toBe('PASSWORD_CHANGE_REQUIRED');
    const write = await post(agent, 'departments', { code: 'X-1', name: 'Blocked' });
    expect(errorOf(write).code).toBe('PASSWORD_CHANGE_REQUIRED');

    // The same password is refused; the policy applies.
    const same = await post(agent, 'auth/password', {
      currentPassword: password,
      newPassword: password,
    });
    expect(same.status).toBe(400);
    expect(errorOf(same).code).toBe('AUTH_PASSWORD_POLICY');

    await post(agent, 'auth/password', {
      currentPassword: password,
      newPassword: NEW_PASSWORD,
    }).expect(200);

    // Flag cleared → full session with REGISTRAR permissions unchanged; other session revoked.
    const after = userOf(await agent.get('/api/v1/auth/me').expect(200));
    expect(after.nextStep).toBeNull();
    expect(after.permissions).toContain('students.write');
    expect(after.permissions).not.toContain('users.manage');
    await agent.get('/api/v1/departments').expect(200);
    await other.get('/api/v1/auth/me').expect(401);
    const row = await testDb().user.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.passwordChangeRequired).toBe(false);
    const audit = await testDb().auditLog.findFirst({
      where: { action: 'AUTH_PASSWORD_CHANGED', entityId: created.id },
    });
    expect(audit?.metadata).toMatchObject({ wasRequired: true, otherSessionsRevoked: 1 });
  });

  it('logout works for a restricted session', async () => {
    const user = await createTestUser({ passwordChangeRequired: true });
    const agent = browser(app);
    await login(agent, user).expect(200);
    await post(agent, 'auth/logout').expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('existing users are not flagged by the migration default', async () => {
    const user = await createTestUser({ roles: ['EXAM_ADMIN'] });
    const agent = browser(app);
    const response = await login(agent, user).expect(200);
    expect(userOf(response).nextStep).toBeNull();
    expect(userOf(response).permissions).toContain('examinations.manage');
  });
});

describe('authenticator enrollment', () => {
  it('shows the secret once, requires a valid code, stores it encrypted and issues recovery codes', async () => {
    const user = await createTestUser({ roles: ['REGISTRAR'] });
    const agent = browser(app);
    const other = browser(app);
    const signedIn = await login(agent, user).expect(200);
    const cookieBefore = setCookie(signedIn, 'dv_session')?.split(';')[0] ?? '';
    await signIn(other, user);

    const started = await post(agent, 'auth/mfa/enrollment');
    expect(started.status).toBe(200);
    expect(started.headers['cache-control']).toBe('no-store');
    const enrollment = mfaEnrollmentStartResponseSchema.parse(started.body);
    expect(enrollment.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enrollment.otpauthUri).toContain(`secret=${enrollment.secret}`);
    expect(enrollment.qrSvgDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);

    // Not active until confirmed.
    expect(userOf(await agent.get('/api/v1/auth/me')).mfaEnabled).toBe(false);
    const wrong = await post(agent, 'auth/mfa/enrollment/confirm', {
      currentPassword: TEST_PASSWORD,
      code: codeFor(enrollment.secret, 5),
    });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe('MFA_INVALID_CODE');
    const malformed = await post(agent, 'auth/mfa/enrollment/confirm', {
      currentPassword: TEST_PASSWORD,
      code: '12ab56',
    });
    expect(malformed.status).toBe(400);

    const confirmed = await post(agent, 'auth/mfa/enrollment/confirm', {
      currentPassword: TEST_PASSWORD,
      code: codeFor(enrollment.secret),
    });
    expect(confirmed.status).toBe(200);
    const { recoveryCodes } = confirmed.body as { recoveryCodes: string[] };
    expect(recoveryCodes).toHaveLength(10);
    for (const code of recoveryCodes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);

    const row = await testDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.mfaEnabledAt).not.toBeNull();
    expect(row.mfaTotpSecretEnc).toMatch(/^v1\./);
    expect(row.mfaTotpSecretEnc).not.toContain(enrollment.secret);
    const stored = await testDb().staffMfaRecoveryCode.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(10);
    for (const code of recoveryCodes) {
      expect(stored.some((item) => item.codeHash.includes(code.replace('-', '')))).toBe(false);
    }

    // The session ID is rotated (like after sign-in verification): the old cookie is dead, the new
    // one continues. Other sessions end. A second enrollment is refused.
    const cookieAfter = setCookie(confirmed, 'dv_session')?.split(';')[0];
    expect(cookieAfter).toBeDefined();
    expect(cookieAfter).not.toBe(cookieBefore);
    await browser(app).get('/api/v1/auth/me').set('Cookie', cookieBefore).expect(401);
    expect(userOf(await agent.get('/api/v1/auth/me').expect(200)).mfaEnabled).toBe(true);
    await other.get('/api/v1/auth/me').expect(401);
    const again = await post(agent, 'auth/mfa/enrollment');
    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe('MFA_ALREADY_ENABLED');
  });

  it('requires the current password to confirm (re-authentication), throttled like sign-in', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    await signIn(agent, user);
    const started = await post(agent, 'auth/mfa/enrollment').expect(200);
    const { secret } = mfaEnrollmentStartResponseSchema.parse(started.body);

    // The contract requires it: a stolen session alone cannot bind an attacker's authenticator.
    const missing = await post(agent, 'auth/mfa/enrollment/confirm', { code: codeFor(secret) });
    expect(missing.status).toBe(400);
    expect(errorOf(missing).code).toBe('VALIDATION_FAILED');

    // A wrong password with a valid code is refused and nothing is activated.
    const wrongPassword = { currentPassword: 'not the account password 77', code: codeFor(secret) };
    const wrong = await post(agent, 'auth/mfa/enrollment/confirm', wrongPassword);
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe('AUTH_INVALID_CREDENTIALS');
    const row = await testDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.mfaEnabledAt).toBeNull();
    expect(row.mfaTotpSecretEnc).toBeNull();
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'AUTH_MFA_FAILURE', entityId: user.id },
    });
    expect(audit.metadata).toMatchObject({ stage: 'enrollment', reason: 'invalid_password' });
    expect(JSON.stringify(audit.metadata)).not.toContain(wrongPassword.currentPassword);

    // Throttled with the sign-in allowance (per account+IP): then even the right password is refused.
    for (let attempt = 1; attempt < config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP; attempt++) {
      expect((await post(agent, 'auth/mfa/enrollment/confirm', wrongPassword)).status).toBe(401);
    }
    const throttled = await post(agent, 'auth/mfa/enrollment/confirm', {
      currentPassword: TEST_PASSWORD,
      code: codeFor(secret),
    });
    expect(throttled.status).toBe(429);
    expect(errorOf(throttled).code).toBe('AUTH_RATE_LIMITED');
    expect(
      (await testDb().user.findUniqueOrThrow({ where: { id: user.id } })).mfaEnabledAt,
    ).toBeNull();
  });

  it('refuses to confirm without a started enrollment', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    await signIn(agent, user);
    const response = await post(agent, 'auth/mfa/enrollment/confirm', {
      currentPassword: TEST_PASSWORD,
      code: '123456',
    });
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('MFA_ENROLLMENT_EXPIRED');
  });
});

describe('sign-in with an authenticator', () => {
  it('password → pending session that can only verify → new full session', async () => {
    const { user, secret } = await mfaUser(['EXAM_ADMIN']);
    const agent = browser(app);
    const response = await login(agent, user);
    expect(response.status).toBe(200);
    const pending = userOf(response);
    expect(pending).toMatchObject({ nextStep: 'MFA_VERIFY', roles: [], permissions: [] });
    const pendingCookie = setCookie(response, 'dv_session');
    expect(pendingCookie).toBeDefined();

    // The pending session reaches nothing else — not even password change or enrollment.
    for (const path of ['departments', 'examinations', 'auth/sessions']) {
      const blocked = await agent.get(`/api/v1/${path}`);
      expect(blocked.status, path).toBe(403);
      expect(errorOf(blocked).code).toBe('MFA_REQUIRED');
    }
    const pw = await post(agent, 'auth/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(errorOf(pw).code).toBe('MFA_REQUIRED');
    expect(errorOf(await post(agent, 'auth/mfa/enrollment')).code).toBe('MFA_REQUIRED');

    // A short absolute lifetime (5 minutes), in a separate credential domain.
    const redis = app.get(RedisService).client;
    const keys = await redis.keys(`${config.REDIS_KEY_PREFIX}session:*`);
    const records = (await Promise.all(keys.map((key) => redis.get(key))))
      .filter((raw): raw is string => raw !== null)
      .map(
        (raw) =>
          JSON.parse(raw) as {
            userId: string;
            stage?: string;
            createdAt: number;
            absoluteExpiresAt: number;
          },
      );
    const record = records.find((item) => item.userId === user.id && item.stage === 'mfa');
    expect(record).toBeDefined();
    expect((record?.absoluteExpiresAt ?? 0) - (record?.createdAt ?? 0)).toBeLessThanOrEqual(
      300_000,
    );

    const verified = await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 1) });
    expect(verified.status).toBe(200);
    const full = userOf(verified);
    expect(full.nextStep).toBeNull();
    expect(full.roles).toEqual(['EXAM_ADMIN']);
    expect(full.permissions).toContain('examinations.manage');
    const fullCookie = setCookie(verified, 'dv_session');
    expect(fullCookie).toBeDefined();
    expect(fullCookie?.split(';')[0]).not.toBe(pendingCookie?.split(';')[0]);
    await agent.get('/api/v1/examinations').expect(200);

    // The pending cookie is dead (rotated session ID).
    const stale = await browser(app)
      .get('/api/v1/auth/me')
      .set('Cookie', pendingCookie?.split(';')[0] ?? '');
    expect(stale.status).toBe(401);

    const audit = await testDb().auditLog.findFirst({
      where: { action: 'AUTH_MFA_VERIFIED', entityId: user.id },
    });
    expect(audit?.metadata).toMatchObject({ method: 'totp' });
  });

  it('rejects a replayed code (same time-step) and codes outside ±1 step', async () => {
    const { user, secret } = await mfaUser();
    const first = browser(app);
    await login(first, user).expect(200);
    const code = codeFor(secret, 1);
    await post(first, 'auth/mfa/verify', { code }).expect(200);

    const second = browser(app);
    await login(second, user).expect(200);
    const replay = await post(second, 'auth/mfa/verify', { code });
    expect(replay.status).toBe(401);
    expect(errorOf(replay).code).toBe('MFA_INVALID_CODE');
    // Older steps are no longer acceptable either, and +2 is outside the window.
    expect((await post(second, 'auth/mfa/verify', { code: codeFor(secret, 0) })).status).toBe(401);
    expect((await post(second, 'auth/mfa/verify', { code: codeFor(secret, 2) })).status).toBe(401);
    const failures = await testDb().auditLog.count({
      where: { action: 'AUTH_MFA_FAILURE', entityId: user.id },
    });
    expect(failures).toBe(3);
  });

  it('accepts each recovery code exactly once', async () => {
    const { user, recoveryCodes } = await mfaUser();
    const recoveryCode = recoveryCodes[0] ?? '';
    const first = browser(app);
    await login(first, user).expect(200);
    // Case and separators are ignored.
    const ok = await post(first, 'auth/mfa/verify', {
      recoveryCode: recoveryCode.toLowerCase().replace('-', ' '),
    });
    expect(ok.status).toBe(200);
    expect(userOf(ok).nextStep).toBeNull();

    const second = browser(app);
    await login(second, user).expect(200);
    const reused = await post(second, 'auth/mfa/verify', { recoveryCode });
    expect(reused.status).toBe(401);
    expect(errorOf(reused).code).toBe('MFA_INVALID_CODE');
    await post(second, 'auth/mfa/verify', { recoveryCode: recoveryCodes[1] }).expect(200);

    const used = await testDb().staffMfaRecoveryCode.count({
      where: { userId: user.id, usedAt: { not: null } },
    });
    expect(used).toBe(2);
    const audit = await testDb().auditLog.findMany({
      where: { action: 'MFA_RECOVERY_CODE_USED', entityId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.metadata)).toEqual([{ remaining: 9 }, { remaining: 8 }]);
  });

  it('concurrent verifies of one pending session yield at most one full session', async () => {
    const { user, secret, recoveryCodes } = await mfaUser();
    const agent = browser(app);
    const response = await login(agent, user).expect(200);
    const cookie = setCookie(response, 'dv_session')?.split(';')[0] ?? '';
    const token = await csrfToken(agent);
    const store = app.get(SessionStore);
    const fullBefore = (await store.list(user.id)).filter((item) => !item.record.stage).length;

    // One valid TOTP code and four valid recovery codes race on the same pending session.
    const bodies = [
      { code: codeFor(secret, 1) },
      ...recoveryCodes.slice(0, 4).map((recoveryCode) => ({ recoveryCode })),
    ];
    const results = await Promise.all(
      bodies.map((body) =>
        http(app)
          .post('/api/v1/auth/mfa/verify')
          .set('Cookie', cookie)
          .set('X-CSRF-Token', token)
          .send(body),
      ),
    );
    const statuses = results.map((result) => result.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    for (const status of statuses) expect([200, 401, 409]).toContain(status);

    // Exactly one new full session; the pending one is gone; at most one recovery code was spent.
    const after = await store.list(user.id);
    expect(after.filter((item) => item.record.stage === 'mfa')).toHaveLength(0);
    expect(after.filter((item) => !item.record.stage)).toHaveLength(fullBefore + 1);
    const spent = await testDb().staffMfaRecoveryCode.count({
      where: { userId: user.id, usedAt: { not: null } },
    });
    expect(spent).toBeLessThanOrEqual(1);
    await http(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('requires exactly one of code / recoveryCode', async () => {
    const { user, secret } = await mfaUser();
    const agent = browser(app);
    await login(agent, user).expect(200);
    expect((await post(agent, 'auth/mfa/verify', {})).status).toBe(400);
    const both = await post(agent, 'auth/mfa/verify', {
      code: codeFor(secret, 1),
      recoveryCode: 'ABCDE-FGHIJ',
    });
    expect(both.status).toBe(400);
  });

  it('throttles wrong codes with the dedicated MFA limits (5 per account+IP per window)', async () => {
    const { user, secret } = await mfaUser();
    const agent = browser(app);
    await login(agent, user).expect(200);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 7) })).status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    // Even a correct code is refused while throttled.
    const blocked = await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 1) });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('student routes ignore a restricted staff session (student auth unchanged)', async () => {
    const { user } = await mfaUser();
    const agent = browser(app);
    await login(agent, user).expect(200);
    const student = await agent.get('/api/v1/student/me');
    expect(student.status).toBe(401);
    expect(errorOf(student).code).toBe('AUTH_REQUIRED');
  });

  it('a full session cannot call verify', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    await signIn(agent, user);
    const response = await post(agent, 'auth/mfa/verify', { code: '123456' });
    expect(response.status).toBe(409);
  });

  it('the previous release cannot use a pending session (separate credential binding)', async () => {
    const { user } = await mfaUser();
    const agent = browser(app);
    const response = await login(agent, user).expect(200);
    const cookie = setCookie(response, 'dv_session')?.split(';')[0] ?? '';
    // Simulate a reader that ignores the `stage` field (release 70b11d2): drop it from the record.
    const redis = app.get(RedisService).client;
    for (const key of await redis.keys(`${config.REDIS_KEY_PREFIX}session:*`)) {
      const raw = await redis.get(key);
      const record = raw ? (JSON.parse(raw) as { userId: string; stage?: string }) : null;
      if (record?.userId === user.id && record.stage === 'mfa') {
        delete record.stage;
        await redis.set(key, JSON.stringify(record), 'KEEPTTL');
      }
    }
    const asOldRelease = await browser(app).get('/api/v1/departments').set('Cookie', cookie);
    expect(asOldRelease.status).toBe(401);
    expect(errorOf(asOldRelease).code).toBe('AUTH_SESSION_EXPIRED');
  });
});

describe('MFA enforcement (STAFF_MFA_ENFORCED=true)', () => {
  let enforced: INestApplication;
  beforeAll(async () => {
    enforced = await createTestApp(realConfig({ STAFF_MFA_ENFORCED: true }));
  });
  afterAll(async () => {
    await enforced.close();
  });

  it('staff without MFA must enroll before reaching anything else', async () => {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(enforced);
    const token = await csrfToken(agent);
    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(userOf(response).nextStep).toBe('MFA_ENROLL');
    const blocked = await agent.get('/api/v1/staff-users');
    expect(blocked.status).toBe(403);
    expect(errorOf(blocked).code).toBe('MFA_ENROLLMENT_REQUIRED');

    const csrf = await csrfToken(agent);
    const started = await agent
      .post('/api/v1/auth/mfa/enrollment')
      .set('X-CSRF-Token', csrf)
      .expect(200);
    const { secret } = mfaEnrollmentStartResponseSchema.parse(started.body);
    const confirmed = await agent
      .post('/api/v1/auth/mfa/enrollment/confirm')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: user.password, code: codeFor(secret) })
      .expect(200);
    expect(authUserSchema.parse((confirmed.body as { user: unknown }).user).nextStep).toBeNull();
    await agent.get('/api/v1/staff-users').expect(200);
  });

  it('a flagged account changes its password first, then enrolls', async () => {
    const user = await createTestUser({ passwordChangeRequired: true });
    const agent = browser(enforced);
    const token = await csrfToken(agent);
    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(userOf(response).nextStep).toBe('PASSWORD_CHANGE');
    const csrf = await csrfToken(agent);
    await agent
      .post('/api/v1/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: user.password, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(userOf(await agent.get('/api/v1/auth/me')).nextStep).toBe('MFA_ENROLL');
  });
});

describe('SUPER_ADMIN staff administration', () => {
  async function admin() {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(app);
    await signIn(agent, user);
    return { user, agent };
  }

  it('lists staff with MFA/password-change state; REGISTRAR and EXAM_ADMIN are forbidden', async () => {
    const { agent } = await admin();
    const flagged = await createTestUser({ passwordChangeRequired: true });
    const list = await agent.get('/api/v1/staff-users').expect(200);
    const entry = (
      list.body as { data: { id: string; passwordChangeRequired: boolean }[] }
    ).data.find((item) => item.id === flagged.id);
    expect(entry?.passwordChangeRequired).toBe(true);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|SecretEnc|argon2/);

    for (const role of ['REGISTRAR', 'EXAM_ADMIN'] as const) {
      const other = await createTestUser({ roles: [role] });
      const otherAgent = browser(app);
      await signIn(otherAgent, other);
      expect((await otherAgent.get('/api/v1/staff-users')).status).toBe(403);
      const reset = await post(otherAgent, `staff-users/${flagged.id}/access-reset`, {});
      expect(reset.status).toBe(403);
      expect(errorOf(reset).code).toBe('FORBIDDEN');
      const disable = await post(otherAgent, `staff-users/${flagged.id}/disable`, {
        reason: 'OTHER',
      });
      expect(disable.status).toBe(403);
    }
  });

  it("resets another member's MFA, requires a new password and revokes their sessions (audited)", async () => {
    const { user: actor, agent } = await admin();
    const { user: target, secret } = await mfaUser();
    const targetAgent = browser(app);
    await login(targetAgent, target).expect(200);
    await post(targetAgent, 'auth/mfa/verify', { code: codeFor(secret, 1) }).expect(200);

    const temporaryPassword = TEMPORARY_PASSWORD;
    await post(agent, `staff-users/${target.id}/access-reset`, { temporaryPassword }).expect(200);

    await targetAgent.get('/api/v1/auth/me').expect(401);
    const row = await testDb().user.findUniqueOrThrow({ where: { id: target.id } });
    expect(row).toMatchObject({
      passwordChangeRequired: true,
      mfaEnabledAt: null,
      mfaTotpSecretEnc: null,
      mfaTotpLastUsedStep: null,
    });
    expect(await testDb().staffMfaRecoveryCode.count({ where: { userId: target.id } })).toBe(0);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'STAFF_ACCESS_RESET', entityId: target.id },
    });
    expect(audit.actorUserId).toBe(actor.id);
    expect(audit.metadata).toMatchObject({
      via: 'api',
      mfaWasEnabled: true,
      recoveryCodesRemoved: 10,
      temporaryLoginSet: true,
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(temporaryPassword);

    // Old password no longer works; the temporary one leads to the password-change step (no MFA).
    expect((await login(browser(app), target)).status).toBe(401);
    const relog = await login(browser(app), { email: target.email, password: temporaryPassword });
    expect(userOf(relog).nextStep).toBe('PASSWORD_CHANGE');

    // Own account is refused; unknown user is 404.
    const body = { temporaryPassword };
    expect((await post(agent, `staff-users/${actor.id}/access-reset`, body)).status).toBe(409);
    expect((await post(agent, `staff-users/${randomUUID()}/access-reset`, body)).status).toBe(404);
  });

  it('disables (retires) a staff account and revokes its sessions (audited)', async () => {
    const { user: actor, agent } = await admin();
    const target = await createTestUser({ roles: ['REGISTRAR'] });
    const targetAgent = browser(app);
    await signIn(targetAgent, target);

    const bad = await post(agent, `staff-users/${target.id}/disable`, { reason: 'free text' });
    expect(bad.status).toBe(400);
    await post(agent, `staff-users/${target.id}/disable`, {
      reason: 'DEMO_ACCOUNT_RETIRED',
    }).expect(200);
    await targetAgent.get('/api/v1/auth/me').expect(401);
    expect((await login(browser(app), target)).status).toBe(401);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'USER_DISABLED', entityId: target.id },
    });
    expect(audit.actorUserId).toBe(actor.id);
    expect(audit.metadata).toEqual({ reason: 'DEMO_ACCOUNT_RETIRED', sessionsRevoked: 1 });

    expect(
      (await post(agent, `staff-users/${target.id}/disable`, { reason: 'OTHER' })).status,
    ).toBe(409);
    expect((await post(agent, `staff-users/${actor.id}/disable`, { reason: 'OTHER' })).status).toBe(
      409,
    );
  });
});

describe('dedicated MFA limits and escalating lockout', () => {
  let counting: INestApplication;
  let locking: INestApplication;
  let lockingConfig: ApiConfig;
  beforeAll(async () => {
    counting = await createTestApp(
      realConfig({ MFA_MAX_ATTEMPTS_PER_ACCOUNT_IP: 100, MFA_MAX_ATTEMPTS_PER_ACCOUNT: 3 }),
    );
    lockingConfig = realConfig({
      MFA_MAX_ATTEMPTS_PER_ACCOUNT_IP: 100,
      MFA_MAX_ATTEMPTS_PER_ACCOUNT: 100,
      MFA_LOCKOUT_THRESHOLD: 3,
      MFA_LOCKOUT_SECONDS: 2,
    });
    locking = await createTestApp(lockingConfig);
  });
  afterAll(async () => {
    await counting.close();
    await locking.close();
  });

  it('a successful code clears only the account+IP counter, never the per-account one', async () => {
    const { user, secret, recoveryCodes } = await mfaUser(['REGISTRAR'], counting);
    const agent = browser(counting);
    await login(agent, user).expect(200);
    expect((await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 7) })).status).toBe(401);
    expect((await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 7) })).status).toBe(401);
    await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 1) }).expect(200);

    // The per-account allowance (3) is used up, success or not: the next sign-in must wait.
    const again = browser(counting);
    await login(again, user).expect(200);
    const throttled = await post(again, 'auth/mfa/verify', { recoveryCode: recoveryCodes[0] });
    expect(throttled.status).toBe(429);
    expect(errorOf(throttled).code).toBe('AUTH_RATE_LIMITED');
    expect(throttled.headers['retry-after']).toBeDefined();
    expect(
      await testDb().staffMfaRecoveryCode.count({
        where: { userId: user.id, usedAt: { not: null } },
      }),
    ).toBe(0);
  });

  it('locks verification after repeated wrong codes (audited), re-arms, and an access reset clears it', async () => {
    const { user, secret } = await mfaUser(['REGISTRAR'], locking);
    const agent = browser(locking);
    await login(agent, user).expect(200);
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 7) })).status).toBe(401);
    }
    // Locked: even the right code is refused, for this and every other pending sign-in.
    const locked = await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 1) });
    expect(locked.status).toBe(429);
    expect(errorOf(locked).code).toBe('MFA_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    const other = browser(locking);
    await login(other, user).expect(200);
    const lockedToo = await post(other, 'auth/mfa/verify', { code: codeFor(secret, 1) });
    expect(errorOf(lockedToo).code).toBe('MFA_LOCKED');
    const audits = await testDb().auditLog.findMany({
      where: { action: 'AUTH_MFA_LOCKED', entityId: user.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toEqual({
      failures: 3,
      threshold: 3,
      windowSeconds: 86_400,
      lockSeconds: 2,
    });

    // After the cool-down the right code works (no step was spent while locked).
    await sleep(2_100);
    await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 1) }).expect(200);

    // Escalation: the failures stay counted for the long window, so one more wrong code re-locks.
    const third = browser(locking);
    await login(third, user).expect(200);
    expect((await post(third, 'auth/mfa/verify', { code: codeFor(secret, 7) })).status).toBe(401);
    const relocked = await post(third, 'auth/mfa/verify', { code: codeFor(secret, 2) });
    expect(errorOf(relocked).code).toBe('MFA_LOCKED');
    expect(
      await testDb().auditLog.count({ where: { action: 'AUTH_MFA_LOCKED', entityId: user.id } }),
    ).toBe(2);

    // A SUPER_ADMIN access reset clears the lock and the failure history.
    const admin = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const adminAgent = browser(locking);
    await signIn(adminAgent, admin);
    await post(adminAgent, `staff-users/${user.id}/access-reset`, {
      temporaryPassword: TEMPORARY_PASSWORD,
    }).expect(200);
    const redis = locking.get(RedisService).client;
    const prefix = lockingConfig.REDIS_KEY_PREFIX;
    expect(
      await redis.exists(`${prefix}mfa-lock:${user.id}`, `${prefix}mfa-failures:${user.id}`),
    ).toBe(0);
  });
});

describe('access reset always replaces the password', () => {
  it('requires a policy-compliant temporary password, so the password hash always changes', async () => {
    const actor = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(app);
    await signIn(agent, actor);
    const target = await createTestUser();
    const before = await testDb().user.findUniqueOrThrow({ where: { id: target.id } });

    const missing = await post(agent, `staff-users/${target.id}/access-reset`, {});
    expect(missing.status).toBe(400);
    expect(errorOf(missing).code).toBe('VALIDATION_FAILED');
    const weak = await post(agent, `staff-users/${target.id}/access-reset`, {
      temporaryPassword: 'password1234',
    });
    expect(weak.status).toBe(400);
    const unchanged = await testDb().user.findUniqueOrThrow({ where: { id: target.id } });
    expect(unchanged.passwordHash).toBe(before.passwordHash);
    expect(unchanged.passwordChangeRequired).toBe(false);

    await post(agent, `staff-users/${target.id}/access-reset`, {
      temporaryPassword: TEMPORARY_PASSWORD,
    }).expect(200);
    const after = await testDb().user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordChangeRequired).toBe(true);
    expect((await login(browser(app), target)).status).toBe(401);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'STAFF_ACCESS_RESET', entityId: target.id },
    });
    expect(audit.metadata).toMatchObject({ temporaryLoginSet: true });
  });
});

describe('last active SUPER_ADMIN', () => {
  it('two concurrent disables can never leave no active SUPER_ADMIN', async () => {
    const db = testDb();
    const service = app.get(StaffUsersService);
    // Test files run one at a time (fileParallelism: false). Park the other active SUPER_ADMINs so
    // the two created here are the only ones, and restore them afterwards.
    const parked = await db.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
      select: { id: true },
    });
    const parkedIds = parked.map((item) => item.id);
    await db.user.updateMany({ where: { id: { in: parkedIds } }, data: { status: 'DISABLED' } });
    try {
      for (let round = 0; round < 5; round++) {
        const first = await createTestUser({ roles: ['SUPER_ADMIN'] });
        const second = await createTestUser({ roles: ['SUPER_ADMIN'] });
        // Each disables the other at the same time.
        const results = await Promise.allSettled([
          service.disable(first.id, second.id, 'OTHER'),
          service.disable(second.id, first.id, 'OTHER'),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected');
        expect(rejected?.reason).toMatchObject({
          code: 'CONFLICT',
          message: 'The last active SUPER_ADMIN cannot be disabled.',
        });
        expect(
          await db.user.count({ where: { id: { in: [first.id, second.id] }, status: 'ACTIVE' } }),
        ).toBe(1);
        expect(
          await db.auditLog.count({
            where: { action: 'USER_DISABLED', entityId: { in: [first.id, second.id] } },
          }),
        ).toBe(1);
        await db.user.updateMany({
          where: { id: { in: [first.id, second.id] } },
          data: { status: 'DISABLED' },
        });
      }
    } finally {
      await db.user.updateMany({ where: { id: { in: parkedIds } }, data: { status: 'ACTIVE' } });
    }
  });
});

describe('break-glass CLI reset (pnpm staff:reset-access)', () => {
  it('removes MFA, sets a temporary password + flag, and every session stops working', async () => {
    const { user, secret } = await mfaUser(['SUPER_ADMIN']);
    const agent = browser(app);
    await login(agent, user).expect(200);
    await post(agent, 'auth/mfa/verify', { code: codeFor(secret, 1) }).expect(200);

    const temporaryPassword = 'operator break glass phrase 4471';
    const result = await resetStaffAccess(testDb(), { email: user.email, temporaryPassword });
    expect(result).toMatchObject({ id: user.id, mfaWasEnabled: true });
    await agent.get('/api/v1/auth/me').expect(401);
    const relog = await login(browser(app), { email: user.email, password: temporaryPassword });
    expect(userOf(relog).nextStep).toBe('PASSWORD_CHANGE');
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'STAFF_ACCESS_RESET', entityId: user.id },
    });
    expect(audit.metadata).toMatchObject({ via: 'cli', mfaWasEnabled: true });
    await expect(
      resetStaffAccess(testDb(), { email: user.email, temporaryPassword: 'password1234' }),
    ).rejects.toThrow(/Temporary password rejected/);
    await expect(resetStaffAccess(testDb(), { email: email(), temporaryPassword })).rejects.toThrow(
      /No staff account/,
    );
  });
});

describe('MFA unavailable without a key (development only)', () => {
  it('refuses enrollment with 503 MFA_UNAVAILABLE and refuses sign-in for enrolled users', async () => {
    const { user } = await mfaUser();
    const keyless = await createTestApp(realConfig({ STAFF_MFA_ENCRYPTION_KEY: undefined }));
    try {
      const plain = await createTestUser();
      const agent = browser(keyless);
      await signIn(agent, plain);
      const token = await csrfToken(agent);
      const response = await agent.post('/api/v1/auth/mfa/enrollment').set('X-CSRF-Token', token);
      expect(response.status).toBe(503);
      expect(errorOf(response).code).toBe('MFA_UNAVAILABLE');

      const enrolled = browser(keyless);
      const loginToken = await csrfToken(enrolled);
      const refused = await enrolled
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', loginToken)
        .send({ email: user.email, password: user.password });
      expect(refused.status).toBe(503);
    } finally {
      await keyless.close();
    }
  });
});

describe('no secrets in logs or audit', () => {
  const logs: string[] = [];
  let logged: INestApplication;
  beforeAll(async () => {
    // Its own app: Nest's logger is process-global and the last created app's logger wins.
    logged = await createTestApp(config, { logSink: (line) => logs.push(line) });
  });
  afterAll(async () => {
    await logged.close();
  });

  it('never writes TOTP secrets, codes, recovery codes or passwords to logs or audit metadata', async () => {
    const original = app;
    app = logged;
    try {
      await runFlow();
    } finally {
      app = original;
    }
  });

  async function runFlow() {
    const { user, secret, recoveryCodes } = await mfaUser();
    const agent = browser(app);
    await login(agent, user).expect(200);
    const code = codeFor(secret, 1);
    await post(agent, 'auth/mfa/verify', { code }).expect(200);
    const second = browser(app);
    await login(second, user).expect(200);
    await post(second, 'auth/mfa/verify', { recoveryCode: recoveryCodes[2] }).expect(200);

    const audit = await testDb().auditLog.findMany({ where: { entityId: user.id } });
    const haystack = [...logs, ...audit.map((entry) => JSON.stringify(entry.metadata))].join('\n');
    expect(logs.length).toBeGreaterThan(0);
    for (const needle of [
      secret,
      code,
      user.password,
      ...recoveryCodes,
      ...recoveryCodes.map((item) => item.replace('-', '')),
    ]) {
      expect(haystack).not.toContain(needle);
    }
  }
});
