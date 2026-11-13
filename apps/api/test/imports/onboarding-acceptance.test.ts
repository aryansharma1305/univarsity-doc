import type { INestApplication } from '@nestjs/common';
import { buildWorkbook, registration2025Sheet } from '@docversity/imports/testing';
import { studentMeSchema } from '@docversity/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browser, createTestApp, realConfig, staff, testDb } from '../helpers.js';
import { images, studentRequestOf, submitRequest } from '../student-profile/support.js';
import { activate, expectStatus, issueCode, studentLogin } from '../student-auth/support.js';
import {
  jobOf,
  startImportWorker,
  tag,
  upload,
  waitForStatus,
  type ImportWorker,
} from './support.js';

let app: INestApplication;
let worker: ImportWorker;
const config = realConfig();

beforeAll(async () => {
  app = await createTestApp(config);
  worker = await startImportWorker(config);
});
afterAll(async () => {
  await worker.close();
  await app.close();
});

describe('synthetic 58-registration onboarding acceptance', () => {
  it('preserves 55 active/3 suspended registrations, re-previews as SKIP, activates and approves missing profile data', async () => {
    const db = testDb();
    const t = tag();
    const registrar = await staff(app, ['REGISTRAR']);
    const examAdmin = await staff(app, ['EXAM_ADMIN']);
    const department = await db.department.create({
      data: { code: `DEV-ON-D-${t}`, name: `Synthetic Health Department ${t}` },
    });
    const programs = await Promise.all(
      ['A', 'B'].map((code) =>
        db.program.create({
          data: {
            code: `DEV-ON-${code}-${t}`,
            name: `Synthetic Course ${code} ${t}`,
            departmentId: department.id,
          },
        }),
      ),
    );
    const [programA, programB] = programs;
    if (!programA || !programB) throw new Error('Missing synthetic programs');
    const session = await db.academicSession.create({
      data: { code: `DEV-ON-S-${t}`, name: `Synthetic Session ${t}`, status: 'ACTIVE' },
    });
    const rows = Array.from({ length: 58 }, (_, index) => ({
      name: `Synthetic Onboarding Student ${index + 1}`,
      registrationNumber: `DEV-ON-${t}-${String(index + 1).padStart(4, '0')}`,
      courseName: index < 19 ? programA.name : programB.name,
      schoolName: index === 17 || index === 18 ? 'Synthetic School' : 'Synthetic Campus',
      status: index < 55 ? 'Active' : 'Inactive',
    }));
    // The private upload copy removes column H entirely, shifting course/school/status left.
    // Every value here is generated; this test never reads the university workbook.
    const source = registration2025Sheet(rows, { includeIdentityValues: false });
    source.rows.forEach((row) => row.splice(7, 1));
    const bytes = await buildWorkbook([source]);
    const created = jobOf(await upload(registrar, bytes, 'synthetic-onboarding.xlsx').expect(201));
    const parsed = await waitForStatus(registrar, created.id, ['MAPPING']);
    const columns = parsed.sheets[0]?.suggestedMapping;
    expect(columns).toMatchObject({
      fullName: 2,
      admissionDate: 3,
      registrationNumber: 4,
      dateOfBirth: 6,
      programCode: 9,
      departmentCode: 11,
      status: 12,
      academicSessionCode: null,
    });
    const mapping = {
      worksheet: 'Registration List',
      columns,
      defaultAcademicSessionId: session.id,
      valueMaps: {
        departmentCode: { 'SYNTHETIC CAMPUS': department.id, 'SYNTHETIC SCHOOL': department.id },
        status: { ACTIVE: 'ACTIVE', INACTIVE: 'SUSPENDED' },
      },
    };
    // Inactive must remain an error until an explicit mapping is supplied.
    await registrar
      .post(`imports/${created.id}/mapping`, {
        ...mapping,
        valueMaps: { departmentCode: mapping.valueMaps.departmentCode },
      })
      .expect(200);
    await registrar.post(`imports/${created.id}/validate`).expect(200);
    expect((await waitForStatus(registrar, created.id, ['VALIDATED'])).counts).toMatchObject({
      total: 58,
      create: 55,
      errors: 3,
    });
    await registrar.post(`imports/${created.id}/mapping`, mapping).expect(200);
    await registrar.post(`imports/${created.id}/validate`).expect(200);
    expect((await waitForStatus(registrar, created.id, ['VALIDATED'])).counts).toMatchObject({
      total: 58,
      create: 58,
      errors: 0,
      update: 0,
      unchanged: 0,
      warnings: 0,
    });
    await registrar.post(`imports/${created.id}/commit`, {}).expect(200);
    expect((await waitForStatus(registrar, created.id, ['COMPLETED'])).counts).toMatchObject({
      created: 58,
      updated: 0,
      errors: 0,
    });
    const registrations = await db.studentRegistration.findMany({
      where: { registrationNumber: { in: rows.map((row) => row.registrationNumber) } },
      include: { student: { include: { account: true } } },
      orderBy: { registrationNumberNormalized: 'asc' },
    });
    expect(registrations).toHaveLength(58);
    expect(new Set(registrations.map((row) => row.studentId)).size).toBe(58);
    expect(registrations.filter((row) => row.status === 'ACTIVE')).toHaveLength(55);
    expect(registrations.filter((row) => row.status === 'SUSPENDED')).toHaveLength(3);
    expect(registrations.filter((row) => row.programId === programA.id)).toHaveLength(19);
    expect(registrations.filter((row) => row.programId === programB.id)).toHaveLength(39);
    expect(registrations.every((row) => row.academicSessionId === session.id)).toBe(true);
    expect(registrations.every((row) => row.departmentId === department.id)).toBe(true);
    expect(
      registrations.every(
        (row) =>
          row.student.dateOfBirth === null &&
          row.student.photoStorageKey === null &&
          row.student.account === null,
      ),
    ).toBe(true);

    const repeat = jobOf(await upload(registrar, bytes, 'synthetic-repeat.xlsx').expect(201));
    await waitForStatus(registrar, repeat.id, ['MAPPING']);
    await registrar.post(`imports/${repeat.id}/mapping`, mapping).expect(200);
    await registrar.post(`imports/${repeat.id}/validate`).expect(200);
    expect((await waitForStatus(registrar, repeat.id, ['VALIDATED'])).counts).toMatchObject({
      total: 58,
      create: 0,
      update: 0,
      unchanged: 58,
      errors: 0,
    });

    const active = registrations[0];
    const suspended = registrations[57];
    if (!active || !suspended) throw new Error('Missing imported synthetic registrations');
    // Registration SUSPENDED currently permits portal access; this is not university policy approval.
    for (const registration of [active, suspended]) {
      const code = await issueCode(registrar, registration.id);
      const agent = browser(app);
      expectStatus(
        await activate(agent, {
          registrationNumber: registration.registrationNumber,
          activationCode: code,
        }),
        200,
      );
      expectStatus(await studentLogin(browser(app), registration.registrationNumber), 200);
    }
    const studentAgent = browser(app);
    expectStatus(await studentLogin(studentAgent, active.registrationNumber), 200);
    const submitted = await submitRequest(
      studentAgent,
      { dateOfBirth: '2000-02-29' },
      {
        photo: { bytes: await images.png(), contentType: 'image/png' },
      },
    );
    expect(submitted.status).toBe(201);
    const request = studentRequestOf(submitted.body);
    expect(request.status).toBe('PENDING');
    const before = studentMeSchema.parse(
      (await studentAgent.get('/api/v1/student/me').expect(200)).body,
    );
    expect(before.student).toMatchObject({ dateOfBirth: null, hasPhoto: false });
    await examAdmin.post(`profile-requests/${request.id}/approve`, {}).expect(403);
    await registrar.post(`profile-requests/${request.id}/approve`, {}).expect(200);
    const after = studentMeSchema.parse(
      (await studentAgent.get('/api/v1/student/me').expect(200)).body,
    );
    expect(after.student).toMatchObject({ dateOfBirth: '2000-02-29', hasPhoto: true });
    await studentAgent
      .get('/api/v1/student/photo')
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    await studentAgent.get('/api/v1/imports').expect(401);
  }, 30_000);
});
