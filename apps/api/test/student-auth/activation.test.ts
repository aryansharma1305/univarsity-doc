import type { INestApplication } from '@nestjs/common';
import { studentMeSchema } from '@docversity/validation';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  browser,
  createTestApp,
  errorOf,
  realConfig,
  setCookie,
  staff,
  testDb,
  type Staff,
} from '../helpers.js';
import { PasswordService } from '../../src/auth/password.service.js';
import {
  activate,
  activatedStudent,
  cookieNamesOf,
  issueCode,
  newRegistration,
  STUDENT_PASSWORD,
  studentCsrf,
  studentLogin,
  expectStatus,
} from './support.js';

let app: INestApplication;
let registrar: Staff;
beforeAll(async () => {
  app = await createTestApp(realConfig({ STUDENT_ACTIVATION_MAX_FAILED_ATTEMPTS: 3 }));
  registrar = await staff(app, ['REGISTRAR']);
});
afterAll(async () => {
  await app.close();
});

const GENERIC = 'STUDENT_ACTIVATION_FAILED';

describe('student account activation', () => {
  it('activates with registration number + single-use code, signs in, and shows only own data', async () => {
    const registration = await newRegistration();
    const code = await issueCode(registrar, registration.registrationId);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

    const agent = browser(app);
    // Case, surrounding spaces and dashes in what the student types do not matter.
    const response = expectStatus(
      await activate(agent, {
        registrationNumber: `  ${registration.registrationNumber.toLowerCase()} `,
        activationCode: code.toLowerCase().replaceAll('-', ' '),
      }),
      200,
    );
    const me = studentMeSchema.parse(response.body);
    expect(me.student.id).toBe(registration.studentId);
    expect(me.registrations.map((r) => r.registrationNumber)).toEqual([
      registration.registrationNumber,
    ]);
    expect(me.student.dateOfBirth).toBeNull();

    // A separate cookie from staff sessions, HttpOnly, SameSite=Lax.
    expect(cookieNamesOf(response)).toContain('dv_student');
    expect(cookieNamesOf(response)).not.toContain('dv_session');
    expect(setCookie(response, 'dv_student')).toMatch(/HttpOnly/i);
    expect(setCookie(response, 'dv_student')).toMatch(/SameSite=Lax/i);
    await agent.get('/api/v1/student/me').expect(200);

    // Stored: an Argon2id hash and a USED code; never the code itself.
    const account = await testDb().studentAccount.findUniqueOrThrow({
      where: { studentId: registration.studentId },
    });
    expect(account.passwordHash).toMatch(/^\$argon2id\$/);
    const codes = await testDb().studentActivationCode.findMany({
      where: { studentRegistrationId: registration.registrationId },
    });
    expect(codes).toHaveLength(1);
    expect(codes[0]?.usedAt).not.toBeNull();
    expect(codes[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(codes)).not.toContain(code.replaceAll('-', ''));
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'STUDENT_ACCOUNT_ACTIVATED', entityId: account.id },
    });
    expect(audit.metadata).toMatchObject({ studentId: registration.studentId, recovery: false });

    // Single use.
    const again = await activate(browser(app), {
      registrationNumber: registration.registrationNumber,
      activationCode: code,
    });
    expect(errorOf(again).code).toBe(GENERIC);
  });

  it('never accepts the registration number alone, and answers every failure identically', async () => {
    const registration = await newRegistration();
    const code = await issueCode(registrar, registration.registrationId);
    const agent = browser(app);
    const token = await studentCsrf(agent);

    const noCode = await agent
      .post('/api/v1/student-auth/activate')
      .set('X-CSRF-Token', token)
      .send({ registrationNumber: registration.registrationNumber, password: STUDENT_PASSWORD });
    expect(noCode.status).toBe(400);
    expect(errorOf(noCode).code).toBe('VALIDATION_FAILED');

    const wrong = await activate(agent, {
      registrationNumber: registration.registrationNumber,
      activationCode: 'ABCD-EFGH-JKLM',
    });
    const unknown = await activate(agent, {
      registrationNumber: `NO-SUCH-${registration.registrationNumber}`,
      activationCode: code,
    });
    const otherRegistration = await newRegistration();
    const crossed = await activate(agent, {
      registrationNumber: otherRegistration.registrationNumber,
      activationCode: code,
    });
    for (const response of [wrong, unknown, crossed]) {
      expect(response.status).toBe(400);
      expect({ code: errorOf(response).code, message: errorOf(response).message }).toEqual({
        code: GENERIC,
        message: errorOf(wrong).message,
      });
    }
    // Failures are audited without the raw registration number or code.
    const failures = await testDb().auditLog.findMany({
      where: { action: 'STUDENT_ACTIVATION_FAILED', entityId: registration.registrationId },
    });
    expect(failures.length).toBeGreaterThan(0);
    expect(JSON.stringify(failures)).not.toContain(registration.registrationNumber);
    // The correct code still works for the right registration.
    expectStatus(
      await activate(browser(app), {
        registrationNumber: registration.registrationNumber,
        activationCode: code,
      }),
      200,
    );
  });

  it('rejects expired and revoked codes', async () => {
    const expired = await newRegistration();
    const expiredCode = await issueCode(registrar, expired.registrationId);
    await testDb().studentActivationCode.updateMany({
      where: { studentRegistrationId: expired.registrationId },
      data: {
        issuedAt: new Date(Date.now() - 2 * 86_400_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect(
      errorOf(
        await activate(browser(app), {
          registrationNumber: expired.registrationNumber,
          activationCode: expiredCode,
        }),
      ).code,
    ).toBe(GENERIC);

    const revoked = await newRegistration();
    const revokedCode = await issueCode(registrar, revoked.registrationId);
    await registrar
      .post('student-accounts/activation-codes/revoke', {
        registrationIds: [revoked.registrationId],
      })
      .expect(200);
    expect(
      errorOf(
        await activate(browser(app), {
          registrationNumber: revoked.registrationNumber,
          activationCode: revokedCode,
        }),
      ).code,
    ).toBe(GENERIC);

    // Re-issuing replaces the previous code: the old one stops working.
    const reissued = await newRegistration();
    const first = await issueCode(registrar, reissued.registrationId);
    const second = await issueCode(registrar, reissued.registrationId);
    expect(
      errorOf(
        await activate(browser(app), {
          registrationNumber: reissued.registrationNumber,
          activationCode: first,
        }),
      ).code,
    ).toBe(GENERIC);
    expectStatus(
      await activate(browser(app), {
        registrationNumber: reissued.registrationNumber,
        activationCode: second,
      }),
      200,
    );
  });

  it('revokes the open code after repeated wrong guesses, and throttles per registration', async () => {
    const registration = await newRegistration();
    const code = await issueCode(registrar, registration.registrationId);
    for (let attempt = 0; attempt < 3; attempt++) {
      await activate(browser(app), {
        registrationNumber: registration.registrationNumber,
        activationCode: 'ZZZZ-ZZZZ-ZZZZ',
      });
    }
    const open = await testDb().studentActivationCode.findFirstOrThrow({
      where: { studentRegistrationId: registration.registrationId },
    });
    expect(open.revokedAt).not.toBeNull();
    expect(open.failedAttempts).toBe(3);
    // Even the right code no longer works — a new one must be issued.
    expect(
      errorOf(
        await activate(browser(app), {
          registrationNumber: registration.registrationNumber,
          activationCode: code,
        }),
      ).code,
    ).toBe(GENERIC);
    // Throttling (5 attempts per registration per window).
    await activate(browser(app), {
      registrationNumber: registration.registrationNumber,
      activationCode: code,
    });
    const throttled = await activate(browser(app), {
      registrationNumber: registration.registrationNumber,
      activationCode: code,
    });
    expect(throttled.status).toBe(429);
    expect(throttled.headers['retry-after']).toBeDefined();
  });

  it('rejects weak passwords without consuming the code', async () => {
    const registration = await newRegistration();
    const code = await issueCode(registrar, registration.registrationId);
    const weak = await activate(browser(app), {
      registrationNumber: registration.registrationNumber,
      activationCode: code,
      password: 'password',
    });
    expect(weak.status).toBe(400);
    expect(errorOf(weak).code).toBe('AUTH_PASSWORD_POLICY');
    expectStatus(
      await activate(browser(app), {
        registrationNumber: registration.registrationNumber,
        activationCode: code,
      }),
      200,
    );
  });

  it('rejects a correct unused code when the registration is suspended after issuance', async () => {
    const registration = await newRegistration();
    const code = await issueCode(registrar, registration.registrationId);
    await testDb().studentRegistration.update({
      where: { id: registration.registrationId },
      data: { status: 'SUSPENDED' },
    });
    const response = await activate(browser(app), {
      registrationNumber: registration.registrationNumber,
      activationCode: code,
    });
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe(GENERIC);
    expect(cookieNamesOf(response)).not.toContain('dv_student');
    expect(
      await testDb().studentAccount.count({ where: { studentId: registration.studentId } }),
    ).toBe(0);
    expect(
      (
        await testDb().studentActivationCode.findFirstOrThrow({
          where: { studentRegistrationId: registration.registrationId },
        })
      ).usedAt,
    ).toBeNull();
  });

  it.each([
    'expiry',
    'disabled account',
    'revoked registration',
    'suspended registration',
  ] as const)(
    'rejects recovery when %s changes during password hashing without consuming the code',
    async (change) => {
      const student = await activatedStudent(app, registrar);
      const code = await issueCode(registrar, student.registrationId);
      const before = await testDb().studentAccount.findUniqueOrThrow({
        where: { id: student.me.account.id },
      });
      const passwords = app.get(PasswordService);
      const hashPassword = passwords.hashPassword.bind(passwords);
      const hashing = vi
        .spyOn(passwords, 'hashPassword')
        .mockImplementationOnce(async (password) => {
          const hash = await hashPassword(password);
          if (change === 'expiry') {
            await testDb().studentActivationCode.updateMany({
              where: { studentRegistrationId: student.registrationId, usedAt: null },
              data: {
                issuedAt: new Date(Date.now() - 2_000),
                expiresAt: new Date(Date.now() - 1_000),
              },
            });
          } else if (change === 'disabled account') {
            await registrar
              .post(`student-accounts/${before.id}/status`, {
                status: 'DISABLED',
                reason: 'Synthetic concurrent account restriction',
              })
              .expect(200);
          } else {
            await testDb().studentRegistration.update({
              where: { id: student.registrationId },
              data: { status: change === 'suspended registration' ? 'SUSPENDED' : 'REVOKED' },
            });
          }
          return hash;
        });
      try {
        const response = await activate(browser(app), {
          registrationNumber: student.registrationNumber,
          activationCode: code,
          password: 'replacement synthetic student passphrase 82',
        });
        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe(GENERIC);
        expect(cookieNamesOf(response)).not.toContain('dv_student');
        const after = await testDb().studentAccount.findUniqueOrThrow({
          where: { id: before.id },
        });
        expect(after.passwordHash).toBe(before.passwordHash);
        expect(after.status).toBe(change === 'disabled account' ? 'DISABLED' : before.status);
        const open = await testDb().studentActivationCode.findFirstOrThrow({
          where: { studentRegistrationId: student.registrationId, revokedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        expect(open.usedAt).toBeNull();
        expect(
          await testDb().auditLog.count({
            where: { action: 'STUDENT_ACCOUNT_ACTIVATED', entityId: before.id },
          }),
        ).toBe(1);
        const denied = await testDb().auditLog.findFirstOrThrow({
          where: {
            action: 'STUDENT_ACTIVATION_FAILED',
            entityId: student.registrationId,
          },
        });
        expect(denied.metadata).toMatchObject({ reason: 'activation_state_changed' });
        expect(JSON.stringify(denied.metadata)).not.toContain(student.registrationNumber);
        expect(JSON.stringify(denied.metadata)).not.toContain(code);
      } finally {
        hashing.mockRestore();
      }
    },
  );

  it('requires the pre-authentication CSRF token', async () => {
    const response = await browser(app).post('/api/v1/student-auth/activate').send({
      registrationNumber: 'X',
      activationCode: 'ABCD-EFGH-JKLM',
      password: STUDENT_PASSWORD,
    });
    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe('CSRF_INVALID');
  });

  it('recovers an account with a new code: new password, old password and sessions end', async () => {
    const student = await activatedStudent(app, registrar);
    const code = await issueCode(registrar, student.registrationId);
    const newPassword = 'a brand new student passphrase 9';
    const recovery = browser(app);
    expectStatus(
      await activate(recovery, {
        registrationNumber: student.registrationNumber,
        activationCode: code,
        password: newPassword,
      }),
      200,
    );
    await student.agent.get('/api/v1/student/me').expect(401);
    expect((await studentLogin(browser(app), student.registrationNumber)).status).toBe(401);
    expectStatus(await studentLogin(browser(app), student.registrationNumber, newPassword), 200);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: {
        action: 'STUDENT_ACCOUNT_ACTIVATED',
        entityId: student.me.account.id,
        metadata: { path: ['recovery'], equals: true },
      },
    });
    expect(audit).toBeDefined();
  });
});
