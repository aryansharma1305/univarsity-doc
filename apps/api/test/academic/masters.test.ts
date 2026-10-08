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
let admin: Staff;
let registrar: Staff;
let viewer: Staff;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [admin, registrar, viewer] = await Promise.all([
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['REGISTRAR']),
    staff(app, ['VIEWER']),
  ]);
});
afterAll(async () => {
  await app.close();
});

async function auditFor(entityId: string) {
  return testDb().auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });
}

describe('departments', () => {
  it('creates, updates and deactivates/reactivates (no delete) with audit entries', async () => {
    const code = uniqueCode('DEP');
    const created = await registrar.post('departments', { code, name: 'Computer Science' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      code,
      name: 'Computer Science',
      status: 'ACTIVE',
      programCount: 0,
    });
    const id = (created.body as { id: string }).id;

    await registrar
      .patch(`departments/${id}`, { name: 'Computer Science & Engineering' })
      .expect(200);
    await registrar.patch(`departments/${id}`, { status: 'INACTIVE' }).expect(200);
    const reactivated = await registrar
      .patch(`departments/${id}`, { status: 'ACTIVE' })
      .expect(200);
    expect(reactivated.body).toMatchObject({ status: 'ACTIVE' });

    const audit = await auditFor(id);
    expect(audit.map((entry) => entry.action)).toEqual([
      'DEPARTMENT_CREATED',
      'DEPARTMENT_UPDATED',
      'DEPARTMENT_STATUS_CHANGED',
      'DEPARTMENT_STATUS_CHANGED',
    ]);
    expect(audit[1]?.metadata).toMatchObject({ changedFields: ['name'] });
    expect(audit[2]?.metadata).toMatchObject({ from: 'ACTIVE', to: 'INACTIVE' });
    expect(audit.every((entry) => entry.actorUserId === registrar.user.id)).toBe(true);

    expect((await registrar.get(`departments/${id}`).expect(200)).body).toMatchObject({ id });
    // No delete endpoint exists (archive via status instead).
    const deletion = await registrar.post(`departments/${id}/delete`);
    expect(deletion.status).toBe(404);
  });

  it('rejects duplicate codes with a field-level 409', async () => {
    const code = uniqueCode('DEP');
    await admin.post('departments', { code, name: 'First' }).expect(201);
    const duplicate = await admin.post('departments', { code, name: 'Second' });
    expect(duplicate.status).toBe(409);
    expect(errorOf(duplicate)).toMatchObject({
      code: 'CONFLICT',
      details: [{ path: 'code', message: 'A department with this code already exists.' }],
    });
  });

  it('denies VIEWER mutations but allows reads', async () => {
    await viewer.get('departments').expect(200);
    const denied = await viewer.post('departments', { code: uniqueCode('DEP'), name: 'Nope' });
    expect(denied.status).toBe(403);
    expect(errorOf(denied).code).toBe('FORBIDDEN');
  });

  it('validates input with field details', async () => {
    const response = await admin.post('departments', { code: 'HAS SPACE', name: '' });
    expect(response.status).toBe(400);
    const paths = errorOf(response)
      .details?.map((detail) => detail.path)
      .sort();
    expect(paths).toEqual(['code', 'name']);
  });
});

describe('programs', () => {
  it('creates with an optional department and only optional extras', async () => {
    const minimal = await registrar.post('programs', { code: uniqueCode('PRG'), name: 'Diploma' });
    expect(minimal.status).toBe(201);
    expect(minimal.body).toMatchObject({ level: null, durationSemesters: null, department: null });

    const dep = (
      await registrar.post('departments', { code: uniqueCode('DEP'), name: 'Engineering' })
    ).body as {
      id: string;
      code: string;
    };
    const full = await registrar.post('programs', {
      code: uniqueCode('PRG'),
      name: 'B.Tech',
      level: 'UG',
      durationSemesters: 8,
      departmentId: dep.id,
    });
    expect(full.status).toBe(201);
    expect(full.body).toMatchObject({
      level: 'UG',
      durationSemesters: 8,
      department: { id: dep.id, code: dep.code },
    });
  });

  it('rejects unknown or inactive departments', async () => {
    const unknown = await registrar.post('programs', {
      code: uniqueCode('PRG'),
      name: 'x',
      departmentId: '01900000-0000-7000-8000-000000000000',
    });
    expect(unknown.status).toBe(400);
    expect(errorOf(unknown).details?.[0]?.path).toBe('departmentId');

    const dep = (
      await registrar.post('departments', {
        code: uniqueCode('DEP'),
        name: 'Old',
        status: 'INACTIVE',
      })
    ).body as { id: string };
    const inactive = await registrar.post('programs', {
      code: uniqueCode('PRG'),
      name: 'x',
      departmentId: dep.id,
    });
    expect(inactive.status).toBe(400);
    expect(errorOf(inactive).details?.[0]?.message).toMatch(/inactive/);
  });

  it('updates, changes status, audits, and rejects duplicate codes', async () => {
    const code = uniqueCode('PRG');
    const program = (await registrar.post('programs', { code, name: 'MBA' })).body as {
      id: string;
    };
    await registrar
      .patch(`programs/${program.id}`, { durationSemesters: 4, status: 'INACTIVE' })
      .expect(200);
    const actions = (await auditFor(program.id)).map((entry) => entry.action);
    expect(actions).toEqual(['PROGRAM_CREATED', 'PROGRAM_UPDATED', 'PROGRAM_STATUS_CHANGED']);

    const other = (await registrar.post('programs', { code: uniqueCode('PRG'), name: 'Other' }))
      .body as { id: string };
    const conflict = await registrar.patch(`programs/${other.id}`, { code });
    expect(conflict.status).toBe(409);
    expect(errorOf(conflict).details?.[0]?.path).toBe('code');
  });

  it('filters by department and status, and searches code/name', async () => {
    const dep = (await admin.post('departments', { code: uniqueCode('DEP'), name: 'Filter Dept' }))
      .body as {
      id: string;
    };
    const marker = uniqueCode('FLT');
    await admin.post('programs', {
      code: `${marker}-A`,
      name: 'Filter Alpha',
      departmentId: dep.id,
    });
    await admin.post('programs', {
      code: `${marker}-B`,
      name: 'Filter Beta',
      departmentId: dep.id,
      status: 'INACTIVE',
    });
    const byDept = await admin.get(`programs?departmentId=${dep.id}`).expect(200);
    expect((byDept.body as { meta: { total: number } }).meta.total).toBe(2);
    const active = await admin.get(`programs?departmentId=${dep.id}&status=ACTIVE`).expect(200);
    expect((active.body as { data: { code: string }[] }).data.map((p) => p.code)).toEqual([
      `${marker}-A`,
    ]);
    const searched = await admin.get(`programs?search=${marker.toLowerCase()}`).expect(200);
    expect((searched.body as { meta: { total: number } }).meta.total).toBe(2);
  });

  it('denies VIEWER mutations', async () => {
    await viewer.post('programs', { code: uniqueCode('PRG'), name: 'x' }).expect(403);
  });
});

describe('academic sessions', () => {
  it('creates and updates with ordered dates, re-checking against stored values', async () => {
    const created = await registrar.post('academic-sessions', {
      code: uniqueCode('SES'),
      name: '2026–27',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      status: 'UPCOMING',
    });
    const id = (created.body as { id: string }).id;

    // Only endsOn is sent, but it precedes the STORED startsOn → rejected.
    const bad = await registrar.patch(`academic-sessions/${id}`, { endsOn: '2026-01-01' });
    expect(bad.status).toBe(400);
    expect(errorOf(bad).details?.[0]?.path).toBe('endsOn');

    await registrar
      .patch(`academic-sessions/${id}`, { status: 'ACTIVE', endsOn: null })
      .expect(200);
    const actions = (await auditFor(id)).map((entry) => entry.action);
    expect(actions).toEqual([
      'ACADEMIC_SESSION_CREATED',
      'ACADEMIC_SESSION_UPDATED',
      'ACADEMIC_SESSION_STATUS_CHANGED',
    ]);
  });

  it('rejects reversed dates on create and denies VIEWER', async () => {
    const reversed = await registrar.post('academic-sessions', {
      code: uniqueCode('SES'),
      name: 'x',
      startsOn: '2026-07-01',
      endsOn: '2026-06-01',
    });
    expect(reversed.status).toBe(400);
    await viewer.post('academic-sessions', { code: uniqueCode('SES'), name: 'x' }).expect(403);
  });
});

describe('pagination contract', () => {
  it('pages results with meta and rejects non-allow-listed sorting', async () => {
    const marker = uniqueCode('PG');
    for (let i = 1; i <= 3; i += 1)
      await admin.post('departments', { code: `${marker}-${i}`, name: `Paging ${i}` });
    const page = await admin
      .get(`departments?search=${marker}&pageSize=2&page=2&sortBy=code&sortOrder=asc`)
      .expect(200);
    expect(page.body).toMatchObject({ meta: { page: 2, pageSize: 2, total: 3, totalPages: 2 } });
    expect((page.body as { data: { code: string }[] }).data.map((d) => d.code)).toEqual([
      `${marker}-3`,
    ]);

    const badSort = await admin.get('departments?sortBy=createdAt;drop');
    expect(badSort.status).toBe(400);
    expect(errorOf(badSort).details?.[0]?.path).toBe('sortBy');
    await admin.get('departments?unknown=1').expect(400);
    await admin.get('departments?pageSize=101').expect(400);
  });

  it('answers 404 for malformed and unknown IDs', async () => {
    await admin.get('departments/not-a-uuid').expect(404);
    await admin.get('departments/01900000-0000-7000-8000-000000000000').expect(404);
  });
});
