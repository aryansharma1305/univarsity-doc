import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Staff,
  createTestApp,
  errorOf,
  realConfig,
  staff,
  testDb,
  uniqueCode,
} from '../helpers.js';

let app: INestApplication;
let registrar: Staff;
let viewer: Staff;
let examAdmin: Staff;
let ids: {
  departmentId: string;
  otherDepartmentId: string;
  programId: string;
  inactiveProgramId: string;
  sessionId: string;
  archivedSessionId: string;
};

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [registrar, viewer, examAdmin] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['VIEWER']),
    staff(app, ['EXAM_ADMIN']),
  ]);
  const dep = (
    await registrar.post('departments', { code: uniqueCode('DEP'), name: 'Engineering' })
  ).body as { id: string };
  const other = (await registrar.post('departments', { code: uniqueCode('DEP'), name: 'Arts' }))
    .body as { id: string };
  const program = (
    await registrar.post('programs', {
      code: uniqueCode('PRG'),
      name: 'B.Tech',
      departmentId: dep.id,
    })
  ).body as { id: string };
  const inactive = (
    await registrar.post('programs', { code: uniqueCode('PRG'), name: 'Old', status: 'INACTIVE' })
  ).body as { id: string };
  const session = (
    await registrar.post('academic-sessions', {
      code: uniqueCode('SES'),
      name: '2026',
      status: 'ACTIVE',
    })
  ).body as { id: string };
  const archived = (
    await registrar.post('academic-sessions', {
      code: uniqueCode('SES'),
      name: 'Old',
      status: 'ARCHIVED',
    })
  ).body as { id: string };
  ids = {
    departmentId: dep.id,
    otherDepartmentId: other.id,
    programId: program.id,
    inactiveProgramId: inactive.id,
    sessionId: session.id,
    archivedSessionId: archived.id,
  };
});
afterAll(async () => {
  await app.close();
});

function newStudent(overrides: { registration?: object; student?: object } = {}) {
  return {
    student: { fullName: `Test Student ${uniqueCode('N')}`, ...overrides.student },
    registration: {
      registrationNumber: uniqueCode('REG'),
      programId: ids.programId,
      academicSessionId: ids.sessionId,
      ...overrides.registration,
    },
  };
}

interface Detail {
  id: string;
  fullName: string;
  registrations: {
    id: string;
    registrationNumber: string;
    status: string;
    department: { id: string } | null;
  }[];
}

describe('creating a student with their first registration', () => {
  it('creates both records and both audit entries; DOB is optional; department derives from the program', async () => {
    const body = newStudent({ student: { fatherName: 'Father Name', dateOfBirth: '' } });
    const response = await registrar.post('students', body);
    expect(response.status).toBe(201);
    const detail = response.body as Detail & { dateOfBirth: string | null; fatherName: string };
    expect(detail.dateOfBirth).toBeNull();
    expect(detail.fatherName).toBe('Father Name');
    expect(detail.registrations).toHaveLength(1);
    expect(detail.registrations[0]?.department?.id).toBe(ids.departmentId);

    const studentAudit = await testDb().auditLog.findMany({ where: { entityId: detail.id } });
    expect(studentAudit.map((entry) => entry.action)).toEqual(['STUDENT_CREATED']);
    expect(JSON.stringify(studentAudit)).not.toContain(body.student.fullName); // no personal values
    const regAudit = await testDb().auditLog.findMany({
      where: { entityId: detail.registrations[0]?.id },
    });
    expect(regAudit.map((entry) => entry.action)).toEqual(['REGISTRATION_CREATED']);
  });

  it('rolls back the student when the registration fails (no orphan)', async () => {
    const existing = (await registrar.post('students', newStudent())).body as Detail;
    const taken = existing.registrations[0]?.registrationNumber ?? '';
    const name = `Rollback Probe ${uniqueCode('R')}`;

    // Same number in different case → duplicate (registration numbers are case-insensitive).
    const duplicate = await registrar.post(
      'students',
      newStudent({
        student: { fullName: name },
        registration: { registrationNumber: taken.toLowerCase() },
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(errorOf(duplicate).details?.[0]?.path).toBe('registrationNumber');

    const inactiveProgram = await registrar.post(
      'students',
      newStudent({
        student: { fullName: name },
        registration: { programId: ids.inactiveProgramId },
      }),
    );
    expect(inactiveProgram.status).toBe(400);

    expect(await testDb().student.count({ where: { fullName: name } })).toBe(0);
  });

  it('enforces program/department/session consistency', async () => {
    const mismatch = await registrar.post(
      'students',
      newStudent({ registration: { departmentId: ids.otherDepartmentId } }),
    );
    expect(mismatch.status).toBe(400);
    expect(errorOf(mismatch).details?.[0]).toMatchObject({ path: 'departmentId' });

    const archived = await registrar.post(
      'students',
      newStudent({ registration: { academicSessionId: ids.archivedSessionId } }),
    );
    expect(archived.status).toBe(400);
    expect(errorOf(archived).details?.[0]?.path).toBe('academicSessionId');
  });

  it('validates required fields', async () => {
    const response = await registrar.post('students', {
      student: { fullName: '' },
      registration: {},
    });
    expect(response.status).toBe(400);
    const paths = errorOf(response).details?.map((d) => d.path) ?? [];
    expect(paths).toEqual(
      expect.arrayContaining([
        'student.fullName',
        'registration.registrationNumber',
        'registration.programId',
        'registration.academicSessionId',
      ]),
    );
  });

  it('is denied to VIEWER and EXAM_ADMIN', async () => {
    await viewer.post('students', newStudent()).expect(403);
    await examAdmin.post('students', newStudent()).expect(403);
  });
});

describe('updating students and registrations', () => {
  it('updates personal details and audits field names only', async () => {
    const student = (await registrar.post('students', newStudent())).body as Detail;
    const updated = await registrar.patch(`students/${student.id}`, {
      dateOfBirth: '2004-05-06',
      gender: 'Female',
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ dateOfBirth: '2004-05-06', gender: 'Female' });
    const entry = await testDb().auditLog.findFirstOrThrow({
      where: { entityId: student.id, action: 'STUDENT_UPDATED' },
    });
    expect(entry.metadata).toEqual({ changedFields: ['dateOfBirth', 'gender'] });
    await viewer.patch(`students/${student.id}`, { gender: 'x' }).expect(403);
  });

  it('changes registration status with an audit entry', async () => {
    const student = (await registrar.post('students', newStudent())).body as Detail;
    const registrationId = student.registrations[0]?.id ?? '';
    const response = await registrar.patch(`registrations/${registrationId}`, {
      status: 'COMPLETED',
      completionDate: '2030-06-30',
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'COMPLETED', completionDate: '2030-06-30' });
    const actions = (
      await testDb().auditLog.findMany({
        where: { entityId: registrationId },
        orderBy: { createdAt: 'asc' },
      })
    ).map((entry) => entry.action);
    expect(actions).toEqual([
      'REGISTRATION_CREATED',
      'REGISTRATION_UPDATED',
      'REGISTRATION_STATUS_CHANGED',
    ]);
    await viewer.patch(`registrations/${registrationId}`, { status: 'ACTIVE' }).expect(403);
  });

  it('rejects a duplicate registration number on update and on a second registration', async () => {
    const a = (await registrar.post('students', newStudent())).body as Detail;
    const b = (await registrar.post('students', newStudent())).body as Detail;
    const conflict = await registrar.patch(`registrations/${b.registrations[0]?.id ?? ''}`, {
      registrationNumber: a.registrations[0]?.registrationNumber,
    });
    expect(conflict.status).toBe(409);

    const second = await registrar.post('registrations', {
      studentId: a.id,
      registrationNumber: a.registrations[0]?.registrationNumber,
      programId: ids.programId,
      academicSessionId: ids.sessionId,
    });
    expect(second.status).toBe(409);

    const added = await registrar.post('registrations', {
      studentId: a.id,
      registrationNumber: uniqueCode('REG'),
      programId: ids.programId,
      academicSessionId: ids.sessionId,
    });
    expect(added.status).toBe(201);
    const detail = (await registrar.get(`students/${a.id}`).expect(200)).body as Detail;
    expect(detail.registrations).toHaveLength(2);
  });

  it('re-checks completion vs stored admission date', async () => {
    const student = (
      await registrar.post(
        'students',
        newStudent({ registration: { admissionDate: '2026-07-01' } }),
      )
    ).body as Detail;
    const response = await registrar.patch(`registrations/${student.registrations[0]?.id ?? ''}`, {
      completionDate: '2025-01-01',
    });
    expect(response.status).toBe(400);
    expect(errorOf(response).details?.[0]?.path).toBe('completionDate');
  });
});

describe('student list and activity', () => {
  it('searches by name or registration number and filters by registration fields', async () => {
    const marker = uniqueCode('LST');
    const student = (
      await registrar.post(
        'students',
        newStudent({
          student: { fullName: `Listing ${marker}` },
          registration: { registrationNumber: `${marker}-1` },
        }),
      )
    ).body as Detail;

    const byName = await viewer.get(`students?search=listing ${marker.toLowerCase()}`).expect(200);
    expect((byName.body as { data: { id: string }[] }).data.map((s) => s.id)).toEqual([student.id]);
    const byNumber = await viewer.get(`students?search=${marker.toLowerCase()}-1`).expect(200);
    expect(
      (
        byNumber.body as {
          data: { id: string; latestRegistration: { registrationNumber: string } }[];
        }
      ).data[0],
    ).toMatchObject({ id: student.id, latestRegistration: { registrationNumber: `${marker}-1` } });

    const filtered = await viewer
      .get(
        `students?search=${marker}&programId=${ids.programId}&academicSessionId=${ids.sessionId}&status=ACTIVE`,
      )
      .expect(200);
    expect((filtered.body as { meta: { total: number } }).meta.total).toBe(1);
    const none = await viewer.get(`students?search=${marker}&status=SUSPENDED`).expect(200);
    expect((none.body as { meta: { total: number } }).meta.total).toBe(0);
    await viewer.get('students?sortBy=dateOfBirth').expect(400);
  });

  it('returns safe activity summaries for the student and their registrations', async () => {
    const student = (await registrar.post('students', newStudent())).body as Detail;
    await registrar.patch(`students/${student.id}`, { gender: 'Male' });
    await registrar.patch(`registrations/${student.registrations[0]?.id ?? ''}`, {
      status: 'SUSPENDED',
    });
    const activity = await viewer.get(`students/${student.id}/activity`).expect(200);
    const summaries = (
      activity.body as { data: { summary: string; actor: string | null }[] }
    ).data.map((a) => a.summary);
    expect(summaries).toEqual([
      expect.stringMatching(/^Registration .* status changed from active to suspended$/),
      'Personal details updated (gender)',
      expect.stringMatching(/^Registration .* created$/),
      'Student record created',
    ]);
    expect(JSON.stringify(activity.body)).not.toContain('Male');
  });
});

describe('dashboard', () => {
  it('returns real counts, and activity only for users with audit.read', async () => {
    const forRegistrar = await registrar.get('dashboard').expect(200);
    const counts = (forRegistrar.body as { counts: Record<string, number> }).counts;
    expect(counts.students).toBe(await testDb().student.count());
    expect(counts.activeRegistrations).toBe(
      await testDb().studentRegistration.count({ where: { status: 'ACTIVE' } }),
    );
    expect(
      (forRegistrar.body as { recentActivity: unknown[] }).recentActivity.length,
    ).toBeGreaterThan(0);

    const forViewer = await viewer.get('dashboard').expect(200);
    expect((forViewer.body as { recentActivity: unknown }).recentActivity).toBeNull();
  });
});
