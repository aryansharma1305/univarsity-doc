import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignCurriculumResultSchema,
  curriculumDetailSchema,
  curriculumListSchema,
  programSchema,
  registrationSchema,
  studentCurriculumSchema,
  subjectSchema,
} from '@docversity/validation';
import {
  browser,
  createTestApp,
  errorOf,
  realConfig,
  staff,
  testDb,
  uniqueCode,
  type Staff,
} from '../helpers.js';
import { existingStudent, masterData, tag } from '../imports/support.js';
import { activate as activateStudent, issueCode } from '../student-auth/support.js';

let app: INestApplication;
let registrar: Staff;
let registrar2: Staff;
let viewer: Staff;
let examAdmin: Staff;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [registrar, registrar2, viewer, examAdmin] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['REGISTRAR']),
    staff(app, ['VIEWER']),
    staff(app, ['EXAM_ADMIN']),
  ]);
});
afterAll(async () => {
  await app.close();
});

const detailOf = (body: unknown) => curriculumDetailSchema.parse(body);

/** A synthetic course created through the API. */
async function course(structure: 'SEMESTER_WISE' | 'YEAR_WISE' = 'SEMESTER_WISE', periods = 2) {
  const response = await registrar.post('programs', {
    code: uniqueCode('CRS'),
    name: `Synthetic Certificate ${tag()}`,
    level: 'CERTIFICATE',
    durationValue: 1,
    durationUnit: 'YEARS',
    academicStructure: structure,
    periodCount: periods,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return programSchema.parse(response.body);
}

async function subject(name = 'Synthetic Subject', category = 'THEORY') {
  const response = await registrar.post('subjects', {
    code: uniqueCode('SUB'),
    name: `${name} ${tag()}`,
    category,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return subjectSchema.parse(response.body);
}

async function curriculum(programId: string, body: Record<string, unknown> = {}) {
  const response = await registrar.post(`programs/${programId}/curricula`, {
    versionCode: `V${tag()}`,
    name: 'Synthetic syllabus',
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return detailOf(response.body);
}

function add(curriculumId: string, subjectId: string, periodNumber: number, extra = {}) {
  return registrar.post(`curricula/${curriculumId}/subjects`, {
    subjectId,
    periodNumber,
    classification: 'THEORY',
    ...extra,
  });
}

/** An ACTIVE curriculum with one subject in period 1. */
async function activeCurriculum(programId: string, body: Record<string, unknown> = {}) {
  const draft = await curriculum(programId, body);
  await add(draft.id, (await subject()).id, 1).expect(201);
  return detailOf((await registrar.post(`curricula/${draft.id}/activate`).expect(200)).body);
}

async function registrationIn(programId: string) {
  const master = await masterData();
  const student = await existingStudent(master, `CUR-${tag()}`, { programId });
  const registration = student.registrations[0];
  if (!registration) throw new Error('no registration');
  return { studentId: student.id, registrationId: registration.id, master };
}

describe('courses (programs)', () => {
  it('creates semester-wise and year-wise courses with duration and period count', async () => {
    const semester = await course('SEMESTER_WISE', 2);
    expect(semester).toMatchObject({
      level: 'CERTIFICATE',
      durationValue: 1,
      durationUnit: 'YEARS',
      academicStructure: 'SEMESTER_WISE',
      periodCount: 2,
      durationSemesters: 2,
      curriculumCount: 0,
    });
    const yearly = await course('YEAR_WISE', 3);
    expect(yearly).toMatchObject({
      academicStructure: 'YEAR_WISE',
      periodCount: 3,
      durationSemesters: null,
    });

    // Duration and periods are validated separately; incomplete pairs are field errors.
    for (const [body, path] of [
      [{ academicStructure: 'SEMESTER_WISE' }, 'periodCount'],
      [{ periodCount: 2 }, 'academicStructure'],
      [{ durationValue: 2 }, 'durationUnit'],
      [{ durationValue: 25, durationUnit: 'YEARS' }, 'durationValue'],
      [{ academicStructure: 'MONTHLY', periodCount: 2 }, 'academicStructure'],
      [{ academicStructure: 'YEAR_WISE', periodCount: 41 }, 'periodCount'],
      [
        { durationSemesters: 4, academicStructure: 'YEAR_WISE', periodCount: 2 },
        'durationSemesters',
      ],
    ] as const) {
      const response = await registrar.post('programs', {
        code: uniqueCode('BAD'),
        name: 'x',
        ...body,
      });
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(errorOf(response).details?.map((d) => d.path)).toContain(path);
    }
    // Updates are validated against the merged state.
    const partial = await registrar.patch(`programs/${yearly.id}`, { academicStructure: null });
    expect(partial.status).toBe(400);
    const switched = await registrar
      .patch(`programs/${yearly.id}`, { academicStructure: 'SEMESTER_WISE', periodCount: 6 })
      .expect(200);
    expect(programSchema.parse(switched.body)).toMatchObject({
      periodCount: 6,
      durationSemesters: 6,
    });
  });

  it('keeps the legacy durationSemesters input working as a semester-wise structure', async () => {
    const response = await registrar.post('programs', {
      code: uniqueCode('LEG'),
      name: 'Legacy client',
      durationSemesters: 4,
    });
    expect(programSchema.parse(response.body)).toMatchObject({
      academicStructure: 'SEMESTER_WISE',
      periodCount: 4,
      durationSemesters: 4,
    });
  });
});

describe('subject catalogue', () => {
  it('creates, reuses across courses and prevents duplicates (case-insensitive)', async () => {
    const shared = await subject('Ultrasound Physics');
    expect(shared.code).toBe(shared.code.toUpperCase());
    const lower = await registrar.post('subjects', {
      code: shared.code.toLowerCase(),
      name: 'Duplicate',
      category: 'THEORY',
    });
    expect(lower.status).toBe(409);
    expect(errorOf(lower).details?.[0]?.path).toBe('code');

    // One catalogue subject, used by two different courses.
    const a = await curriculum((await course()).id);
    const b = await curriculum((await course('YEAR_WISE', 1)).id);
    await add(a.id, shared.id, 1, { credits: 4 }).expect(201);
    await add(b.id, shared.id, 1, { credits: 6, classification: 'COMBINED' }).expect(201);
    const reread = subjectSchema.parse(
      (await registrar.get(`subjects/${shared.id}`).expect(200)).body,
    );
    expect(reread.usageCount).toBe(2);
    // Course-specific rules live on the assignment, not the subject.
    expect(
      detailOf((await registrar.get(`curricula/${b.id}`)).body).periods[0]?.subjects[0],
    ).toMatchObject({
      credits: 6,
      classification: 'COMBINED',
    });

    const search = await registrar
      .get(`subjects?search=${encodeURIComponent('ultrasound physics')}`)
      .expect(200);
    expect((search.body as { data: { id: string }[] }).data.map((s) => s.id)).toContain(shared.id);
  });

  it('refuses inactive subjects in new assignments and validates categories and credits', async () => {
    const retired = await subject('Retired');
    await registrar.patch(`subjects/${retired.id}`, { status: 'INACTIVE' }).expect(200);
    const draft = await curriculum((await course()).id);
    const response = await add(draft.id, retired.id, 1);
    expect(response.status).toBe(400);
    expect(errorOf(response).details?.[0]?.path).toBe('subjectId');
    for (const body of [
      { code: uniqueCode('X'), name: 'x', category: 'LAB' },
      { code: uniqueCode('X'), name: 'x', category: 'THEORY', defaultCredits: -1 },
      { code: uniqueCode('X'), name: 'x', category: 'THEORY', defaultCredits: 1.234 },
      { code: 'has space', name: 'x', category: 'THEORY' },
    ]) {
      expect((await registrar.post('subjects', body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('curriculum editing (DRAFT)', () => {
  it('builds a semester-wise curriculum period by period, with ordering and labels', async () => {
    const program = await course('SEMESTER_WISE', 2);
    const draft = await curriculum(program.id, { versionCode: '2026', name: '2026 syllabus' });
    expect(draft).toMatchObject({
      status: 'DRAFT',
      structureType: 'SEMESTER_WISE',
      numberOfPeriods: 2,
    });
    expect(draft.periods.map((p) => p.label)).toEqual(['Semester 1', 'Semester 2']);

    const [physics, anatomy, practice] = await Promise.all([
      subject('Physics'),
      subject('Anatomy'),
      subject('Scanning Practice', 'PRACTICAL'),
    ]);
    await add(draft.id, physics.id, 1, { credits: 4, maxMarks: 100, passMarks: 40 }).expect(201);
    await add(draft.id, anatomy.id, 1, { credits: 3 }).expect(201);
    const withComponents = await add(draft.id, practice.id, 2, {
      classification: 'PRACTICAL',
      maxMarks: 100,
      passMarks: 50,
      components: [
        { name: 'Internal assessment', maxMarks: 40 },
        { name: 'Practical examination', maxMarks: 60, passMarks: 30 },
      ],
    });
    expect(withComponents.status, JSON.stringify(withComponents.body)).toBe(201);
    let detail = detailOf(withComponents.body);
    expect(detail.periods[0]?.subjects.map((s) => s.subject.id)).toEqual([physics.id, anatomy.id]);
    expect(detail.periods[1]?.subjects[0]?.components).toEqual([
      { name: 'Internal assessment', maxMarks: 40, passMarks: null },
      { name: 'Practical examination', maxMarks: 60, passMarks: 30 },
    ]);

    const [first, second] = detail.periods[0]?.subjects ?? [];
    detail = detailOf(
      (
        await registrar
          .post(`curricula/${draft.id}/subjects/reorder`, {
            periodNumber: 1,
            assignmentIds: [second?.id, first?.id],
          })
          .expect(200)
      ).body,
    );
    expect(detail.periods[0]?.subjects.map((s) => s.subject.id)).toEqual([anatomy.id, physics.id]);
    // A reorder must list exactly the period's subjects.
    expect(
      (
        await registrar.post(`curricula/${draft.id}/subjects/reorder`, {
          periodNumber: 1,
          assignmentIds: [first?.id],
        })
      ).status,
    ).toBe(400);

    // Move a subject to Semester 2, edit marks, remove it.
    detail = detailOf(
      (
        await registrar
          .patch(`curricula/${draft.id}/subjects/${first?.id}`, { periodNumber: 2, credits: 5 })
          .expect(200)
      ).body,
    );
    expect(detail.periods[1]?.subjects.map((s) => s.subject.id)).toEqual([practice.id, physics.id]);
    detail = detailOf(
      (await registrar.del(`curricula/${draft.id}/subjects/${first?.id}`).expect(200)).body,
    );
    expect(detail.subjectCount).toBe(2);

    // Draft metadata is editable; reducing periods below used ones is refused.
    await registrar.patch(`curricula/${draft.id}`, { name: '2026 syllabus (revised)' }).expect(200);
    const shrink = await registrar.patch(`curricula/${draft.id}`, { numberOfPeriods: 1 });
    expect(shrink.status).toBe(400);
    expect(errorOf(shrink).details?.[0]?.path).toBe('numberOfPeriods');
  });

  it('builds a year-wise curriculum and labels its periods as years', async () => {
    const program = await course('YEAR_WISE', 2);
    const draft = await curriculum(program.id);
    expect(draft.periods.map((p) => p.label)).toEqual(['Year 1', 'Year 2']);
    const response = await add(draft.id, (await subject()).id, 1);
    expect(detailOf(response.body).periods[0]?.subjects).toHaveLength(1);
  });

  it('validates periods, marks, credits, components and duplicates', async () => {
    const draft = await curriculum((await course('SEMESTER_WISE', 2)).id);
    const s = await subject();
    for (const [extra, path] of [
      [{ periodNumber: 3 }, 'periodNumber'],
      [{ periodNumber: 0 }, 'periodNumber'],
      [{ maxMarks: -1 }, 'maxMarks'],
      [{ maxMarks: 50, passMarks: 60 }, 'passMarks'],
      [{ passMarks: 40 }, 'maxMarks'],
      [{ credits: -2 }, 'credits'],
      [{ credits: 100 }, 'credits'],
      [{ credits: 1.555 }, 'credits'],
      [
        {
          maxMarks: 100,
          components: [
            { name: 'Internal', maxMarks: 30 },
            { name: 'External', maxMarks: 60 },
          ],
        },
        'components',
      ],
      [
        {
          components: [
            { name: 'A', maxMarks: 10 },
            { name: 'a', maxMarks: 10 },
          ],
        },
        'components',
      ],
      [{ components: [{ name: 'A', maxMarks: 10, passMarks: 11 }] }, 'components'],
    ] as const) {
      const body = { periodNumber: 1, ...extra };
      const response = await add(draft.id, s.id, body.periodNumber, extra);
      expect(response.status, JSON.stringify(extra)).toBe(400);
      expect(
        errorOf(response).details?.some((d) => d.path.startsWith(path)),
        JSON.stringify(errorOf(response).details),
      ).toBe(true);
    }
    expect((await add(draft.id, '01900000-0000-7000-8000-000000000000', 1)).status).toBe(400);
    await add(draft.id, s.id, 1).expect(201);
    const duplicate = await add(draft.id, s.id, 2);
    expect(duplicate.status).toBe(409);
    expect(errorOf(duplicate).message).toMatch(/already in this curriculum \(Semester 1\)/);
  });
});

describe('lifecycle and historical protection', () => {
  it('activates explicitly, then freezes the version (only the end date may change)', async () => {
    const program = await course();
    const draft = await curriculum(program.id, {
      versionCode: '2025',
      effectiveFrom: '2025-01-01',
    });
    const empty = await registrar.post(`curricula/${draft.id}/activate`);
    expect(empty.status).toBe(409);
    expect(errorOf(empty).message).toMatch(/at least one subject/);
    const s = await subject();
    await add(draft.id, s.id, 1).expect(201);
    const active = detailOf(
      (await registrar.post(`curricula/${draft.id}/activate`).expect(200)).body,
    );
    expect(active).toMatchObject({ status: 'ACTIVE', activatedBy: { id: registrar.user.id } });

    const assignmentId = active.periods[0]?.subjects[0]?.id ?? '';
    for (const response of [
      await registrar.patch(`curricula/${draft.id}`, { name: 'Changed' }),
      await add(draft.id, (await subject()).id, 2),
      await registrar.patch(`curricula/${draft.id}/subjects/${assignmentId}`, { credits: 9 }),
      await registrar.del(`curricula/${draft.id}/subjects/${assignmentId}`),
      await registrar.post(`curricula/${draft.id}/subjects/reorder`, {
        periodNumber: 1,
        assignmentIds: [assignmentId],
      }),
      await registrar.post(`curricula/${draft.id}/activate`),
    ]) {
      expect(response.status).toBe(409);
      expect(errorOf(response).code).toBe('CURRICULUM_NOT_EDITABLE');
    }
    await registrar.patch(`curricula/${draft.id}`, { effectiveTo: '2025-12-31' }).expect(200);
  });

  it('keeps old versions intact when a new version is created, activated and the old one archived', async () => {
    const program = await course();
    const old = await activeCurriculum(program.id, {
      versionCode: '2025',
      effectiveFrom: '2025-01-01',
    });
    const { registrationId } = await registrationIn(program.id);
    await registrar
      .post(`curricula/${old.id}/registrations`, { registrationIds: [registrationId] })
      .expect(200);

    // A new version starts as a copy; editing it never touches the old one.
    const next = await curriculum(program.id, {
      versionCode: '2026',
      copyFromCurriculumId: old.id,
    });
    expect(next.subjectCount).toBe(old.subjectCount);
    await add(next.id, (await subject()).id, 2).expect(201);
    expect(detailOf((await registrar.get(`curricula/${old.id}`)).body).subjectCount).toBe(
      old.subjectCount,
    );

    // Overlapping active periods are refused until the old version is closed.
    const overlapping = await registrar.patch(`curricula/${next.id}`, {
      effectiveFrom: '2025-06-01',
    });
    expect(overlapping.status).toBe(200);
    const refused = await registrar.post(`curricula/${next.id}/activate`);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).code).toBe('CURRICULUM_OVERLAP');
    await registrar.patch(`curricula/${old.id}`, { effectiveTo: '2025-05-31' }).expect(200);
    await registrar.post(`curricula/${next.id}/activate`).expect(200);

    // Archiving keeps the version readable and the student's assignment unchanged.
    await registrar.post(`curricula/${old.id}/archive`).expect(200);
    const archived = detailOf((await registrar.get(`curricula/${old.id}`).expect(200)).body);
    expect(archived).toMatchObject({
      status: 'ARCHIVED',
      registrationCount: 1,
      subjectCount: old.subjectCount,
    });
    expect(
      (await testDb().studentRegistration.findUniqueOrThrow({ where: { id: registrationId } }))
        .curriculumId,
    ).toBe(old.id);
    expect((await registrar.post(`curricula/${old.id}/archive`)).status).toBe(409);
    expect(
      (await registrar.patch(`curricula/${old.id}`, { effectiveTo: '2025-04-30' })).status,
    ).toBe(409);

    const versions = curriculumListSchema.parse(
      (await registrar.get(`programs/${program.id}/curricula`)).body,
    );
    expect(versions.data.map((v) => [v.versionCode, v.status])).toEqual([
      ['2026', 'ACTIVE'],
      ['2025', 'ARCHIVED'],
    ]);
    // Version codes are unique within a program.
    const dup = await registrar.post(`programs/${program.id}/curricula`, {
      versionCode: '2026',
      name: 'dup',
    });
    expect(dup.status).toBe(409);
    expect(errorOf(dup).details?.[0]?.path).toBe('versionCode');
  });

  it('lets exactly one of two concurrent overlapping activations win', async () => {
    const program = await course();
    const a = await curriculum(program.id);
    const b = await curriculum(program.id);
    await add(a.id, (await subject()).id, 1).expect(201);
    await add(b.id, (await subject()).id, 1).expect(201);
    const results = await Promise.all([
      registrar.post(`curricula/${a.id}/activate`),
      registrar2.post(`curricula/${b.id}/activate`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await testDb().programCurriculum.count({
        where: { programId: program.id, status: 'ACTIVE' },
      }),
    ).toBe(1);
  });
});

describe('student curriculum assignment', () => {
  it('assigns explicitly, never silently replaces, and shows the student only their own', async () => {
    const program = await course();
    const draft = await curriculum(program.id);
    const v1 = await activeCurriculum(program.id, { effectiveTo: '2025-12-31' });
    const v2 = await activeCurriculum(program.id, { effectiveFrom: '2026-01-01' });
    const first = await registrationIn(program.id);
    const second = await registrationIn(program.id);
    const foreign = await registrationIn((await course()).id);

    // Only ACTIVE versions are assignable.
    const fromDraft = await registrar.post(`curricula/${draft.id}/registrations`, {
      registrationIds: [first.registrationId],
    });
    expect(fromDraft.status).toBe(409);

    const result = assignCurriculumResultSchema.parse(
      (
        await registrar
          .post(`curricula/${v1.id}/registrations`, {
            registrationIds: [first.registrationId, foreign.registrationId],
          })
          .expect(200)
      ).body,
    );
    expect(result.assigned).toBe(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        registrationId: foreign.registrationId,
        reason: 'Not a registration of this program.',
      }),
    ]);

    // Moving to another version needs explicit confirmation.
    const unconfirmed = assignCurriculumResultSchema.parse(
      (
        await registrar.post(`curricula/${v2.id}/registrations`, {
          registrationIds: [first.registrationId],
        })
      ).body,
    );
    expect(unconfirmed.assigned).toBe(0);
    expect(unconfirmed.skipped[0]?.reason).toMatch(/Confirm replacing/);
    const confirmed = assignCurriculumResultSchema.parse(
      (
        await registrar.post(`curricula/${v2.id}/registrations`, {
          registrationIds: [first.registrationId],
          replaceExisting: true,
        })
      ).body,
    );
    expect(confirmed.assigned).toBe(1);

    // Listing and filtering registrations of the program.
    const unassigned = await registrar
      .get(`curricula/${v2.id}/registrations?assignment=unassigned`)
      .expect(200);
    const ids = (unassigned.body as { data: { registrationId: string }[] }).data.map(
      (r) => r.registrationId,
    );
    expect(ids).toContain(second.registrationId);
    expect(ids).not.toContain(first.registrationId);
    expect(ids).not.toContain(foreign.registrationId);

    // The registration API shows the curriculum; changing its program is refused while assigned.
    const registration = registrationSchema.parse(
      (await registrar.get(`registrations/${first.registrationId}`).expect(200)).body,
    );
    expect(registration.curriculum).toMatchObject({ id: v2.id, status: 'ACTIVE' });
    const moved = await registrar.patch(`registrations/${first.registrationId}`, {
      programId: (await course()).id,
    });
    expect(moved.status).toBe(400);
    expect(errorOf(moved).details?.[0]?.path).toBe('programId');

    // The student sees only their own registrations' curricula.
    const code = await issueCode(registrar, first.registrationId);
    const agent = browser(app);
    const registrationNumber = (
      await testDb().studentRegistration.findUniqueOrThrow({ where: { id: first.registrationId } })
    ).registrationNumber;
    expect(
      (await activateStudent(agent, { registrationNumber, activationCode: code })).status,
    ).toBe(200);
    const mine = studentCurriculumSchema.parse(
      (await agent.get('/api/v1/student/curriculum').expect(200)).body,
    );
    expect(mine.registrations).toHaveLength(1);
    expect(mine.registrations[0]?.curriculum).toMatchObject({
      versionCode: v2.versionCode,
      structureType: 'SEMESTER_WISE',
    });
    expect(mine.registrations[0]?.curriculum?.periods[0]?.subjects).toHaveLength(1);
    expect((await browser(app).get('/api/v1/student/curriculum')).status).toBe(401);
    expect((await agent.get(`/api/v1/curricula/${v2.id}`)).status).toBe(401);
  });
});

describe('authorization and audit', () => {
  it('lets read-only roles read but never mutate', async () => {
    const program = await course();
    const draft = await curriculum(program.id);
    const s = await subject();
    for (const member of [viewer, examAdmin]) {
      await member.get(`programs/${program.id}/curricula`).expect(200);
      await member.get(`curricula/${draft.id}`).expect(200);
      await member.get('subjects').expect(200);
      for (const response of [
        await member.post('subjects', { code: uniqueCode('NO'), name: 'x', category: 'THEORY' }),
        await member.patch(`subjects/${s.id}`, { name: 'x' }),
        await member.post(`programs/${program.id}/curricula`, { versionCode: 'NO', name: 'x' }),
        await member.patch(`curricula/${draft.id}`, { name: 'x' }),
        await member.post(`curricula/${draft.id}/subjects`, {
          subjectId: s.id,
          periodNumber: 1,
          classification: 'THEORY',
        }),
        await member.post(`curricula/${draft.id}/activate`),
        await member.post(`curricula/${draft.id}/archive`),
        await member.post(`curricula/${draft.id}/registrations`, { registrationIds: [draft.id] }),
      ]) {
        expect(response.status).toBe(403);
      }
    }
    // CSRF is required for mutations.
    expect((await registrar.agent.post(`/api/v1/curricula/${draft.id}/archive`)).status).toBe(403);
    expect(detailOf((await registrar.get(`curricula/${draft.id}`)).body).status).toBe('DRAFT');
  });

  it('audits every change with codes and field names, never student personal data', async () => {
    const program = await course();
    const draft = await curriculum(program.id, { versionCode: 'AUD' });
    const s = await subject();
    const added = detailOf((await add(draft.id, s.id, 1).expect(201)).body);
    const assignmentId = added.periods[0]?.subjects[0]?.id ?? '';
    await registrar
      .patch(`curricula/${draft.id}/subjects/${assignmentId}`, { credits: 3 })
      .expect(200);
    await registrar.post(`curricula/${draft.id}/activate`).expect(200);
    const { registrationId } = await registrationIn(program.id);
    await registrar
      .post(`curricula/${draft.id}/registrations`, { registrationIds: [registrationId] })
      .expect(200);
    await registrar.post(`curricula/${draft.id}/archive`).expect(200);

    const audit = await testDb().auditLog.findMany({
      where: { entityType: 'ProgramCurriculum', entityId: draft.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      'CURRICULUM_CREATED',
      'CURRICULUM_SUBJECT_ADDED',
      'CURRICULUM_SUBJECT_UPDATED',
      'CURRICULUM_ACTIVATED',
      'STUDENT_CURRICULUM_ASSIGNED',
      'CURRICULUM_ARCHIVED',
    ]);
    expect(audit.every((entry) => entry.actorUserId === registrar.user.id)).toBe(true);
    expect(audit[2]?.metadata).toMatchObject({ subjectCode: s.code, changedFields: ['credits'] });
    const logged = JSON.stringify(audit);
    expect(logged).not.toContain('Test Existing');
    const subjectAudit = await testDb().auditLog.findMany({
      where: { entityType: 'Subject', entityId: s.id },
    });
    expect(subjectAudit.map((entry) => entry.action)).toEqual(['SUBJECT_CREATED']);
    const programAudit = await testDb().auditLog.findMany({
      where: { entityType: 'Program', entityId: program.id },
    });
    expect(programAudit.map((entry) => entry.action)).toEqual(['PROGRAM_CREATED']);
  });
});

describe('historical identity protection', () => {
  it('preserves catalogue identity after activation, including direct API edits', async () => {
    const p = await course();
    const c = await curriculum(p.id);
    const s = await subject();
    await add(c.id, s.id, 1).expect(201);
    await registrar.patch(`subjects/${s.id}`, { name: 'Corrected before publication' }).expect(200);
    await registrar.post(`curricula/${c.id}/activate`).expect(200);
    const protectedSubject = subjectSchema.parse((await registrar.get(`subjects/${s.id}`)).body);
    expect(protectedSubject.historyLocked).toBe(true);
    const rewrite = await registrar.patch(`subjects/${s.id}`, { name: 'Rewritten historic title' });
    expect(rewrite.status).toBe(409);
    expect(errorOf(rewrite).message).toContain('academic history');
    await registrar
      .patch(`subjects/${s.id}`, { status: 'INACTIVE', defaultCredits: 8 })
      .expect(200);
    const reread = detailOf((await registrar.get(`curricula/${c.id}`)).body);
    expect(reread.periods[0]?.subjects[0]?.subject.name).toBe('Corrected before publication');
  });

  it('allows partial course updates against stored duration and structure', async () => {
    const p = await course();
    const updated = programSchema.parse(
      (await registrar.patch(`programs/${p.id}`, { durationValue: 2 }).expect(200)).body,
    );
    expect(updated.durationValue).toBe(2);
    expect(updated.durationUnit).toBe('YEARS');
  });

  it('skips assigning legacy registrations with results rather than guessing their version', async () => {
    const p = await course();
    const c = await activeCurriculum(p.id);
    const reg = await registrationIn(p.id);
    const db = testDb();
    const registration = await db.studentRegistration.findUniqueOrThrow({
      where: { id: reg.registrationId },
    });
    const exam = await db.examination.create({
      data: {
        code: uniqueCode('HIST'),
        name: 'Synthetic historical exam',
        programId: p.id,
        academicSessionId: registration.academicSessionId,
        semesterNumber: 1,
        examSession: 'SYNTHETIC',
      },
    });
    await db.result.create({
      data: { studentRegistrationId: registration.id, examinationId: exam.id },
    });
    const result = assignCurriculumResultSchema.parse(
      (
        await registrar
          .post(`curricula/${c.id}/registrations`, { registrationIds: [registration.id] })
          .expect(200)
      ).body,
    );
    expect(result.assigned).toBe(0);
    expect(result.skipped[0]?.reason).toContain('historical results');
    expect(
      (await db.studentRegistration.findUniqueOrThrow({ where: { id: registration.id } }))
        .curriculumId,
    ).toBeNull();
  });
});
