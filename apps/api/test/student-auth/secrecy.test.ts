import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisService } from '../../src/redis/redis.service.js';
import { redact } from '../../src/common/json-logger.js';
import {
  browser,
  createTestApp,
  realConfig,
  signIn,
  staff,
  createTestUser,
  testDb,
  type Staff,
} from '../helpers.js';
import { activate, cookieNamesOf, expectStatus, issueCode, newRegistration } from './support.js';

const config = realConfig({ LOG_LEVEL: 'debug' });
const lines: string[] = [];
let app: INestApplication;
let registrar: Staff;

beforeAll(async () => {
  // The structured logger at debug level, capturing every line the API writes.
  app = await createTestApp(config, { logSink: (line) => lines.push(line) });
  registrar = await staff(app, ['REGISTRAR']);
});
afterAll(async () => {
  await app.close();
});

describe('activation code secrecy', () => {
  it('never writes a code to logs or the database in plain text', async () => {
    const registration = await newRegistration('SECRET');
    const code = await issueCode(registrar, registration.registrationId);
    const plain = code.replaceAll('-', '');
    // Failures, then a success.
    await activate(browser(app), {
      registrationNumber: registration.registrationNumber,
      activationCode: 'ZZZZ-ZZZZ-ZZZZ',
    });
    await activate(browser(app), {
      registrationNumber: `NO-${registration.registrationNumber}`,
      activationCode: code,
    });
    expectStatus(
      await activate(browser(app), {
        registrationNumber: registration.registrationNumber,
        activationCode: code,
      }),
      200,
    );

    expect(lines.length).toBeGreaterThan(0);
    const logged = lines.join('\n');
    expect(logged).not.toContain(code);
    expect(logged).not.toContain(plain);

    const [codes, audit] = await Promise.all([
      testDb().studentActivationCode.findMany({
        where: { studentRegistrationId: registration.registrationId },
      }),
      testDb().auditLog.findMany({
        where: {
          OR: [
            { entityId: registration.registrationId },
            { metadata: { path: ['registrationId'], equals: registration.registrationId } },
          ],
        },
      }),
    ]);
    const stored = JSON.stringify({ codes, audit });
    expect(audit.length).toBeGreaterThan(1);
    expect(stored).not.toContain(plain);
    expect(stored).not.toContain(code);
  });

  it('redacts activation codes if they are ever passed to the logger', () => {
    expect(
      redact({
        activationCode: 'ABCD-EFGH-JKLM',
        nested: { activation_code: 'X' },
        code: 'DEPT-CSE',
      }),
    ).toEqual({
      activationCode: '[REDACTED]',
      nested: { activation_code: '[REDACTED]' },
      // Ordinary "code" keys (department/program codes in audit metadata) must NOT be redacted.
      code: 'DEPT-CSE',
    });
  });
});

describe('staff authentication never creates student sessions', () => {
  it('a staff sign-in sets only the staff cookie and no student session exists for it', async () => {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(app);
    const preAuth = (await agent.get('/api/v1/auth/csrf').expect(200)).body as {
      csrfToken: string;
    };
    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', preAuth.csrfToken)
      .send({ email: user.email, password: 'correct horse battery staple 42' })
      .expect(200);
    expect(cookieNamesOf(response)).toContain('dv_session');
    expect(cookieNamesOf(response)).not.toContain('dv_student');
    expect((await agent.get('/api/v1/student/me')).status).toBe(401);
    // The student session namespace holds no index entry for this staff user.
    const redis = app.get(RedisService).client;
    expect(await redis.exists(`${config.REDIS_KEY_PREFIX}student-sessions:${user.id}`)).toBe(0);
    expect(await testDb().studentAccount.count({ where: { id: user.id } })).toBe(0);
    await signIn(browser(app), user);
  });
});
