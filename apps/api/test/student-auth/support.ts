import type { INestApplication } from '@nestjs/common';
import { issuedActivationCodesSchema, studentMeSchema } from '@docversity/validation';
import { browser, type Staff, testDb } from '../helpers.js';
import { existingStudent, masterData, tag } from '../imports/support.js';

type Agent = ReturnType<typeof browser>;

/** A registration (with a fresh student) created directly in the test database. */
export async function newRegistration(prefix = 'STU') {
  const master = await masterData();
  const registrationNumber = `${prefix}-${tag()}`;
  const student = await existingStudent(master, registrationNumber, {
    fullName: `Test Student ${tag()}`,
  });
  const registration = student.registrations[0];
  if (!registration) throw new Error('no registration');
  return { master, studentId: student.id, registrationId: registration.id, registrationNumber };
}

/** Issues an activation code through the staff API and returns the plain (formatted) code. */
export async function issueCode(registrar: Staff, registrationId: string): Promise<string> {
  const response = await registrar
    .post('student-accounts/activation-codes', { registrationIds: [registrationId] })
    .expect(200);
  const code = issuedActivationCodesSchema.parse(response.body).issued[0]?.code;
  if (!code) throw new Error('no code issued');
  return code;
}

export async function studentCsrf(agent: Agent): Promise<string> {
  const response = await agent.get('/api/v1/student-auth/csrf').expect(200);
  return (response.body as { csrfToken: string }).csrfToken;
}

export const STUDENT_PASSWORD = 'student horse battery staple 7';

interface TestResponse {
  status: number;
  body: unknown;
  headers: Record<string, unknown>;
}

export async function activate(
  agent: Agent,
  body: { registrationNumber: string; activationCode: string; password?: string },
): Promise<TestResponse> {
  // Fetch the token BEFORE building the request (supertest binds the server when the request is created).
  const token = await studentCsrf(agent);
  return agent
    .post('/api/v1/student-auth/activate')
    .set('X-CSRF-Token', token)
    .send({ password: STUDENT_PASSWORD, ...body });
}

export async function studentLogin(
  agent: Agent,
  registrationNumber: string,
  password = STUDENT_PASSWORD,
): Promise<TestResponse> {
  const token = await studentCsrf(agent);
  return agent
    .post('/api/v1/student-auth/login')
    .set('X-CSRF-Token', token)
    .send({ registrationNumber, password });
}

/** A signed-in student (activated through the real endpoints). */
export async function activatedStudent(app: INestApplication, registrar: Staff, prefix = 'STU') {
  const registration = await newRegistration(prefix);
  const code = await issueCode(registrar, registration.registrationId);
  const agent = browser(app);
  const response = await activate(agent, {
    registrationNumber: registration.registrationNumber,
    activationCode: code,
  });
  if (response.status !== 200)
    throw new Error(`activation failed: ${JSON.stringify(response.body)}`);
  return { ...registration, agent, me: studentMeSchema.parse(response.body) };
}

export function cookieNamesOf(response: { headers: Record<string, unknown> }): string[] {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header)
    ? (header as string[])
    : typeof header === 'string'
      ? [header]
      : [];
  return cookies.map((cookie) => cookie.split('=')[0] ?? '');
}

export { testDb };

/** Asserts the status of an already-awaited response (helpers that fetch a CSRF token first are async). */
export function expectStatus<T extends { status: number; body: unknown }>(
  response: T,
  status: number,
): T {
  if (response.status !== status) {
    throw new Error(`Expected ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response;
}
