import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StudentSessionStore } from '../../src/student-auth/student-session.store.js';
import { SessionStore } from '../../src/auth/session.store.js';
import { UsersService } from '../../src/users/users.service.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { API_CONFIG, type ApiConfig } from '../../src/config/api-config.js';
import { PasswordService } from '../../src/auth/password.service.js';
import {
  browser,
  createTestApp,
  createTestUser,
  csrfToken,
  realConfig,
  signIn,
  http,
  testDb,
  staff,
} from '../helpers.js';
import {
  activate,
  activatedStudent,
  issueCode,
  newRegistration,
  studentLogin,
} from '../student-auth/support.js';

let app: INestApplication;
const sent: { email: string; resetUrl: string }[] = [];
const replacement = 'replacement synthetic passphrase 83';
beforeAll(async () => {
  app = await createTestApp(realConfig(), {
    passwordResetNotifier: {
      isConfigured: () => true,
      sendResetLink: (input) => {
        sent.push(input);
        return Promise.resolve();
      },
    },
  });
});
afterAll(async () => {
  await app.close();
});

describe('credential replacement during pending login', () => {
  it('does not overwrite a completed reset with an earlier pending password change', async () => {
    const user = await createTestUser();
    const current = browser(app);
    const csrf = await signIn(current, user);
    const preAuth = await csrfToken(current);
    await current
      .post('/api/v1/auth/forgot-password')
      .set('X-CSRF-Token', preAuth)
      .send({ email: user.email })
      .expect(202);
    const url = sent.findLast((message) => message.email === user.email)?.resetUrl;
    expect(url).toBeDefined();
    const token = decodeURIComponent(url?.split('#token=')[1] ?? '');
    const recovered = 'recovered synthetic passphrase 84';
    const passwords = app.get(PasswordService);
    const hash = passwords.hashPassword.bind(passwords);
    const hashing = vi.spyOn(passwords, 'hashPassword').mockImplementationOnce(async (password) => {
      const result = await hash(password);
      await current
        .post('/api/v1/auth/reset-password')
        .set('X-CSRF-Token', csrf)
        .send({ token, newPassword: recovered })
        .expect(200);
      return result;
    });
    try {
      await current
        .post('/api/v1/auth/password')
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: user.password, newPassword: replacement })
        .expect(401);
      const fresh = browser(app);
      const freshCsrf = await csrfToken(fresh);
      const recoveredLogin = await fresh
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', freshCsrf)
        .send({ email: user.email, password: recovered });
      const rejected = browser(app);
      const rejectedCsrf = await csrfToken(rejected);
      const staleLogin = await rejected
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', rejectedCsrf)
        .send({ email: user.email, password: replacement });
      expect({ recovered: recoveredLogin.status, stale: staleLogin.status }).toEqual({
        recovered: 200,
        stale: 401,
      });
    } finally {
      hashing.mockRestore();
    }
  });

  it('does not overwrite a newer completed reset with an earlier pending reset', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const requestReset = async () => {
      const csrf = await csrfToken(agent);
      await agent
        .post('/api/v1/auth/forgot-password')
        .set('X-CSRF-Token', csrf)
        .send({ email: user.email })
        .expect(202);
      const url = sent.findLast((message) => message.email === user.email)?.resetUrl;
      if (!url) throw new Error('Synthetic reset not delivered');
      return decodeURIComponent(url.split('#token=')[1] ?? '');
    };
    const firstToken = await requestReset();
    const csrf = await csrfToken(agent);
    const passwords = app.get(PasswordService);
    const hash = passwords.hashPassword.bind(passwords);
    const recovered = 'newest synthetic recovery passphrase 95';
    const hashing = vi.spyOn(passwords, 'hashPassword').mockImplementationOnce(async (password) => {
      const result = await hash(password);
      const nextToken = await requestReset();
      const nextCsrf = await csrfToken(agent);
      await agent
        .post('/api/v1/auth/reset-password')
        .set('X-CSRF-Token', nextCsrf)
        .send({ token: nextToken, newPassword: recovered })
        .expect(200);
      return result;
    });
    try {
      const response = await agent
        .post('/api/v1/auth/reset-password')
        .set('X-CSRF-Token', csrf)
        .send({ token: firstToken, newPassword: replacement });
      expect(response.status).toBe(400);
      await signIn(browser(app), { email: user.email, password: recovered });
    } finally {
      hashing.mockRestore();
    }
  });

  it.each(['password change', 'password reset'] as const)(
    'rejects an old-credential staff session created after %s finishes',
    async (change) => {
      const user = await createTestUser({ roles: ['REGISTRAR'] });
      const legitimate = browser(app);
      const csrf = await signIn(legitimate, user);
      let resetToken = '';
      if (change === 'password reset') {
        const preAuth = await csrfToken(legitimate);
        await legitimate
          .post('/api/v1/auth/forgot-password')
          .set('X-CSRF-Token', preAuth)
          .send({ email: user.email })
          .expect(202);
        const url = sent.findLast((message) => message.email === user.email)?.resetUrl;
        expect(url).toBeDefined();
        resetToken = decodeURIComponent(url?.split('#token=')[1] ?? '');
      }
      const passwords = app.get(PasswordService);
      const verify = passwords.verifyPassword.bind(passwords);
      const verification = vi
        .spyOn(passwords, 'verifyPassword')
        .mockImplementationOnce(async (hash, password) => {
          const valid = await verify(hash, password);
          expect(valid).toBe(true);
          await legitimate
            .post(`/api/v1/auth/${change === 'password change' ? 'password' : 'reset-password'}`)
            .set('X-CSRF-Token', csrf)
            .send(
              change === 'password change'
                ? { currentPassword: user.password, newPassword: replacement }
                : { token: resetToken, newPassword: replacement },
            )
            .expect(200);
          return valid;
        });
      try {
        const pending = browser(app);
        await signIn(pending, user);
        await pending.get('/api/v1/auth/me').expect(401);
        await legitimate.get('/api/v1/auth/me').expect(change === 'password change' ? 200 : 401);
        const fresh = browser(app);
        const token = await csrfToken(fresh);
        await fresh
          .post('/api/v1/auth/login')
          .set('X-CSRF-Token', token)
          .send({ email: user.email, password: user.password })
          .expect(401);
        await signIn(browser(app), { email: user.email, password: replacement });
      } finally {
        verification.mockRestore();
      }
    },
  );

  it('rejects an old-credential student session created after recovery finishes', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const student = await activatedStudent(app, registrar);
    const code = await issueCode(registrar, student.registrationId);
    const passwords = app.get(PasswordService);
    const verify = passwords.verifyPassword.bind(passwords);
    const recovered = browser(app);
    const verification = vi
      .spyOn(passwords, 'verifyPassword')
      .mockImplementationOnce(async (hash, password) => {
        const valid = await verify(hash, password);
        expect(valid).toBe(true);
        expect(
          (
            await activate(recovered, {
              registrationNumber: student.registrationNumber,
              activationCode: code,
              password: replacement,
            })
          ).status,
        ).toBe(200);
        return valid;
      });
    try {
      const pending = browser(app);
      expect((await studentLogin(pending, student.registrationNumber)).status).toBe(200);
      await pending.get('/api/v1/student/me').expect(401);
      await recovered.get('/api/v1/student/me').expect(200);
      await student.agent.get('/api/v1/student/me').expect(401);
      expect((await studentLogin(browser(app), student.registrationNumber)).status).toBe(401);
      expect(
        (await studentLogin(browser(app), student.registrationNumber, replacement)).status,
      ).toBe(200);
    } finally {
      verification.mockRestore();
    }
  });

  it('preserves the current credential binding when an earlier request records activity', async () => {
    const user = await createTestUser();
    const current = browser(app);
    const csrf = await signIn(current, user);
    const sessions = app.get(SessionStore);
    const touch = sessions.touch.bind(sessions);
    const activity = vi.spyOn(sessions, 'touch').mockImplementationOnce(async (id, record) => {
      await current
        .post('/api/v1/auth/password')
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: user.password, newPassword: replacement })
        .expect(200);
      return touch(id, record);
    });
    try {
      await current.get('/api/v1/auth/me').expect(200);
      await current.get('/api/v1/auth/me').expect(200);
    } finally {
      activity.mockRestore();
    }
  });

  it('does not delete the current session during the database-to-Redis credential update', async () => {
    const user = await createTestUser();
    const current = browser(app);
    const csrf = await signIn(current, user);
    const users = app.get(UsersService);
    const save = users.setPasswordHash.bind(users);
    let duringUpdate = 0;
    const update = vi
      .spyOn(users, 'setPasswordHash')
      .mockImplementationOnce(async (id, hash, expected) => {
        await save(id, hash, expected);
        duringUpdate = (await current.get('/api/v1/auth/me')).status;
      });
    try {
      await current
        .post('/api/v1/auth/password')
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: user.password, newPassword: replacement })
        .expect(200);
      expect(duringUpdate).toBe(401);
      await current.get('/api/v1/auth/me').expect(200);
    } finally {
      update.mockRestore();
    }
  });

  it('rejects a pre-upgrade session without a credential binding', async () => {
    const user = await createTestUser();
    const stored = await testDb().user.findUniqueOrThrow({ where: { id: user.id } });
    if (!stored.passwordHash) throw new Error('Synthetic credential missing');
    const sessions = app.get(SessionStore);
    const { sessionId, record } = await sessions.create({
      userId: user.id,
      passwordHash: stored.passwordHash,
      device: null,
      ipHash: null,
    });
    const { credentialVersion, ...legacy } = record;
    expect(credentialVersion).toMatch(/^[0-9a-f]{64}$/);
    const config = app.get<ApiConfig>(API_CONFIG);
    await app
      .get(RedisService)
      .client.set(
        `${config.REDIS_KEY_PREFIX}session:${sessions.hashOf(sessionId)}`,
        JSON.stringify(legacy),
        'EX',
        60,
      );
    await http(app).get('/api/v1/auth/me').set('Cookie', `dv_session=${sessionId}`).expect(401);
  });

  it('rejects a pre-upgrade student session without a credential binding', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const student = await activatedStudent(app, registrar);
    const account = await testDb().studentAccount.findUniqueOrThrow({
      where: { studentId: student.studentId },
    });
    if (!account.passwordHash) throw new Error('Synthetic student password missing');
    const sessions = app.get(StudentSessionStore);
    const { sessionId, record } = await sessions.create({
      userId: account.id,
      passwordHash: account.passwordHash,
      device: null,
      ipHash: null,
    });
    const legacy = { ...record };
    Reflect.deleteProperty(legacy, 'credentialVersion');
    const config = app.get<ApiConfig>(API_CONFIG);
    await app
      .get(RedisService)
      .client.set(
        `${config.REDIS_KEY_PREFIX}student-session:${sessions.hashOf(sessionId)}`,
        JSON.stringify(legacy),
        'EX',
        60,
      );
    await http(app).get('/api/v1/student/me').set('Cookie', `dv_student=${sessionId}`).expect(401);
    await student.agent.get('/api/v1/student/me').expect(200);
  });

  it('allows concurrent valid logins without merging their sessions', async () => {
    const user = await createTestUser();
    const first = browser(app);
    const second = browser(app);
    await Promise.all([signIn(first, user), signIn(second, user)]);
    await first.get('/api/v1/auth/me').expect(200);
    await second.get('/api/v1/auth/me').expect(200);
    const token = await csrfToken(first);
    await first.post('/api/v1/auth/logout').set('X-CSRF-Token', token).expect(200);
    await first.get('/api/v1/auth/me').expect(401);
    await second.get('/api/v1/auth/me').expect(200);
  });

  it('consumes an activation code once under concurrent submissions', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const student = await newRegistration();
    const activationCode = await issueCode(registrar, student.registrationId);
    const responses = await Promise.all(
      [browser(app), browser(app)].map((agent) =>
        activate(agent, { registrationNumber: student.registrationNumber, activationCode }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  });
});
