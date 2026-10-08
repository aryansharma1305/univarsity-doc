import type { INestApplication } from '@nestjs/common';
import { studentMeSchema } from '@docversity/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  browser,
  createTestApp,
  errorOf,
  realConfig,
  signIn,
  staff,
  createTestUser,
  testDb,
  type Staff,
} from '../helpers.js';
import {
  activatedStudent,
  newRegistration,
  STUDENT_PASSWORD,
  studentCsrf,
  studentLogin,
  expectStatus,
} from './support.js';

let app: INestApplication;
let registrar: Staff;
beforeAll(async () => {
  app = await createTestApp(realConfig());
  registrar = await staff(app, ['REGISTRAR']);
});
afterAll(async () => {
  await app.close();
});

describe('student sign-in', () => {
  it('signs in with any of the student’s registration numbers and returns only their own records', async () => {
    const student = await activatedStudent(app, registrar);
    // A second registration of the same student, and an unrelated student.
    const second = await testDb().studentRegistration.create({
      data: {
        studentId: student.studentId,
        registrationNumber: `${student.registrationNumber}-B`,
        registrationNumberNormalized: `${student.registrationNumber}-B`.toUpperCase(),
        programId: student.master.otherProgram.id,
        academicSessionId: student.master.session.id,
      },
    });
    const stranger = await newRegistration('OTHER');

    const agent = browser(app);
    const response = expectStatus(
      await studentLogin(agent, second.registrationNumber.toLowerCase()),
      200,
    );
    const me = studentMeSchema.parse(response.body);
    expect(me.registrations.map((r) => r.registrationNumber).sort()).toEqual(
      [student.registrationNumber, second.registrationNumber].sort(),
    );
    expect(JSON.stringify(me)).not.toContain(stranger.registrationNumber);
    const account = await testDb().studentAccount.findUniqueOrThrow({
      where: { id: me.account.id },
    });
    expect(account.lastLoginAt).not.toBeNull();
  });

  it('gives the same answer for unknown numbers, unactivated registrations and wrong passwords', async () => {
    const student = await activatedStudent(app, registrar);
    const unactivated = await newRegistration();
    const responses = [
      await studentLogin(browser(app), student.registrationNumber, 'wrong password entirely 42'),
      await studentLogin(browser(app), unactivated.registrationNumber),
      await studentLogin(browser(app), `NOPE-${student.registrationNumber}`),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('AUTH_INVALID_CREDENTIALS');
    }
  });

  it('logs out and the old cookie stops working', async () => {
    const student = await activatedStudent(app, registrar);
    const token = await studentCsrf(student.agent);
    await student.agent.post('/api/v1/student-auth/logout').set('X-CSRF-Token', token).expect(200);
    await student.agent.get('/api/v1/student/me').expect(401);
    expect(
      await testDb().auditLog.count({
        where: { action: 'STUDENT_LOGOUT', entityId: student.me.account.id },
      }),
    ).toBe(1);
  });

  it('ends sessions immediately when staff lock or disable the account', async () => {
    const student = await activatedStudent(app, registrar);
    const disabled = await registrar.post(`student-accounts/${student.me.account.id}/status`, {
      status: 'DISABLED',
      reason: 'Test: account under review',
    });
    expect(disabled.status).toBe(200);
    await student.agent.get('/api/v1/student/me').expect(401);
    expect((await studentLogin(browser(app), student.registrationNumber)).status).toBe(401);
    // A disabled account cannot be recovered with a new code; re-activation is a staff decision.
    const issue = await registrar
      .post('student-accounts/activation-codes', { registrationIds: [student.registrationId] })
      .expect(200);
    expect((issue.body as { skipped: { reason: string }[] }).skipped[0]?.reason).toMatch(
      /disabled/,
    );
    expect(
      (
        await registrar.post(`student-accounts/${student.me.account.id}/status`, {
          status: 'DISABLED',
        })
      ).status,
    ).toBe(400);
    await registrar
      .post(`student-accounts/${student.me.account.id}/status`, { status: 'ACTIVE' })
      .expect(200);
    expectStatus(await studentLogin(browser(app), student.registrationNumber), 200);
  });
});

describe('staff / student boundary', () => {
  it('a student session can never reach staff endpoints', async () => {
    const student = await activatedStudent(app, registrar);
    for (const path of ['auth/me', 'students', 'imports', 'student-accounts', 'dashboard']) {
      const response = await student.agent.get(`/api/v1/${path}`);
      expect(response.status, path).toBe(401);
    }
    const token = await studentCsrf(student.agent);
    const write = await student.agent
      .post('/api/v1/departments')
      .set('X-CSRF-Token', token)
      .send({ code: 'X', name: 'X' });
    expect(write.status).toBe(401);
  });

  it('a staff session can never act as a student', async () => {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(app);
    await signIn(agent, user);
    expect((await agent.get('/api/v1/student/me')).status).toBe(401);
  });

  it('student session CSRF tokens are required and are not interchangeable with staff ones', async () => {
    const student = await activatedStudent(app, registrar);
    expect((await student.agent.post('/api/v1/student-auth/logout')).status).toBe(403);
    expect(
      (await student.agent.post('/api/v1/student-auth/logout').set('X-CSRF-Token', registrar.csrf))
        .status,
    ).toBe(403);
    await student.agent.get('/api/v1/student/me').expect(200);
  });

  it('student ownership comes from the session: there is no way to ask for another student', async () => {
    const student = await activatedStudent(app, registrar);
    const other = await newRegistration('OTHER');
    // Query parameters and ids in the path are not part of the API at all.
    const response = await student.agent
      .get(`/api/v1/student/me?studentId=${other.studentId}`)
      .expect(200);
    expect(studentMeSchema.parse(response.body).student.id).toBe(student.studentId);
    await student.agent.get(`/api/v1/student/${other.studentId}`).expect(404);
  });
});

export { STUDENT_PASSWORD };
