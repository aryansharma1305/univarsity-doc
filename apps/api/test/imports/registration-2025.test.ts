import type { INestApplication } from '@nestjs/common';
import { buildWorkbook, registration2025Sheet } from '@docversity/imports/testing';
import { importRowDetailSchema } from '@docversity/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, errorOf, realConfig, staff, testDb } from '../helpers.js';
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

/**
 * The university's "Registration 2025" layout with SYNTHETIC data: no session column, course names
 * instead of program codes, a school name, "Active"/"Inactive" statuses, empty Date of Birth and Photo,
 * numeric registration numbers and a national-ID column (fake values).
 */
describe('student import of the "Registration 2025" workbook shape', () => {
  it('imports via course names, one session for the file and translated values — never storing identity numbers', async () => {
    const db = testDb();
    const t = tag();
    const courseA = `Certificate in Test Sonography ${t}`;
    const courseB = `Certificate in Test Ultrasound ${t}`;
    const department = await db.department.create({
      data: { code: `DEV-D-${t}`, name: `Test Health School ${t}` },
    });
    const programA = await db.program.create({
      data: { code: `DEV-CTS-${t}`, name: courseA, departmentId: department.id },
    });
    const programB = await db.program.create({ data: { code: `DEV-CTU-${t}`, name: courseB } });
    const session = await db.academicSession.create({
      data: { code: `DEV-2025-${t}`, name: `Test 2025 ${t}`, status: 'ACTIVE' },
    });
    const base = 900_000_000 + Math.floor(Math.random() * 90_000_000);
    const rows = Array.from({ length: 6 }, (_, index) => ({
      name: `Test Student ${index + 1}`,
      registrationNumber: base + index,
      courseName: index < 4 ? courseA : courseB,
      schoolName: index < 5 ? `Test Health School ${t}` : 'Test Main Campus',
      status: index === 3 ? 'Inactive' : 'Active',
    }));

    const registrar = await staff(app, ['REGISTRAR']);
    const created = jobOf(
      await upload(
        registrar,
        await buildWorkbook([registration2025Sheet(rows)]),
        'Registration 2025 (synthetic).xlsx',
      ).expect(201),
    );
    const mapping = await waitForStatus(registrar, created.id, ['MAPPING']);
    const sheet = mapping.sheets[0];
    expect(sheet?.name).toBe('Registration List');
    expect(sheet?.columns.find((column) => column.letter === 'H')).toMatchObject({
      header: 'National Id No.',
      sensitive: true,
      values: null,
    });
    expect(
      sheet?.columns.find((column) => column.header === 'Registration Status')?.values,
    ).toEqual(['Active', 'Inactive']);
    expect(JSON.stringify(mapping)).not.toContain('TEST-NATIONAL-ID');

    // Without a session the mapping is incomplete; unknown records in value maps are rejected.
    const noSession = await registrar.post(`imports/${created.id}/mapping`, {
      worksheet: 'Registration List',
      columns: sheet?.suggestedMapping,
    });
    expect(errorOf(noSession).details?.map((d) => d.path)).toEqual(['columns.academicSessionCode']);
    const badMap = await registrar.post(`imports/${created.id}/mapping`, {
      worksheet: 'Registration List',
      columns: sheet?.suggestedMapping,
      defaultAcademicSessionId: session.id,
      valueMaps: { programCode: { 'NO SUCH COURSE': '0199a8f0-0000-7000-8000-00000000dead' } },
    });
    expect(errorOf(badMap).details?.[0]).toEqual({
      path: 'valueMaps.programCode.NO SUCH COURSE',
      message: 'Choose an existing program for "NO SUCH COURSE".',
    });
    const mappingIdentity = await registrar.post(`imports/${created.id}/mapping`, {
      worksheet: 'Registration List',
      columns: { ...sheet?.suggestedMapping, rollReferenceNumber: 8 },
      defaultAcademicSessionId: session.id,
    });
    expect(errorOf(mappingIdentity).details?.[0]?.message).toMatch(/identity numbers/);

    await registrar
      .post(`imports/${created.id}/mapping`, {
        worksheet: 'Registration List',
        columns: sheet?.suggestedMapping,
        defaultAcademicSessionId: session.id,
        valueMaps: {
          departmentCode: { 'TEST MAIN CAMPUS': null },
          status: { INACTIVE: 'SUSPENDED' },
        },
      })
      .expect(200);
    await registrar.post(`imports/${created.id}/validate`).expect(200);
    const validated = await waitForStatus(registrar, created.id, ['VALIDATED']);
    // Rows 2–5: course A (department matched by school name); row 6: course B + school "Test Health
    // School" — course B has no department, so the school is accepted; row 7: course B, no department.
    expect(validated.counts).toMatchObject({ total: 6, errors: 0, warnings: 0, create: 6 });

    const detail = importRowDetailSchema.parse(
      (await registrar.get(`imports/${created.id}/rows/5`).expect(200)).body,
    );
    expect(detail.normalized).toMatchObject({
      programCode: programA.code,
      academicSessionCode: session.code,
      status: 'SUSPENDED',
    });
    expect(detail.source.map((cell) => cell.header)).not.toContain('National Id No.');

    // Identity numbers are not in the staging rows (only in the private source workbook).
    const staged = await db.importRow.findMany({ where: { importJobId: created.id } });
    expect(JSON.stringify(staged)).not.toContain('TEST-NATIONAL-ID');

    await registrar.post(`imports/${created.id}/commit`, {}).expect(200);
    const done = await waitForStatus(registrar, created.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ created: 6 });
    const registrations = await db.studentRegistration.findMany({
      where: { registrationNumber: { in: rows.map((row) => String(row.registrationNumber)) } },
      include: { student: true },
      orderBy: { registrationNumber: 'asc' },
    });
    expect(
      registrations.map((r) => [r.programId, r.departmentId, r.academicSessionId, r.status]),
    ).toEqual([
      [programA.id, department.id, session.id, 'ACTIVE'],
      [programA.id, department.id, session.id, 'ACTIVE'],
      [programA.id, department.id, session.id, 'ACTIVE'],
      [programA.id, department.id, session.id, 'SUSPENDED'],
      [programB.id, department.id, session.id, 'ACTIVE'],
      [programB.id, null, session.id, 'ACTIVE'],
    ]);
    // Date of birth and photo stay empty — students supply them later (separate phase).
    expect(
      registrations.every(
        (r) => r.student.dateOfBirth === null && r.student.photoStorageKey === null,
      ),
    ).toBe(true);
  });
});
