import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  examinationDetailSchema,
  examinationListSchema,
  externalExamAppListSchema,
  externalExamAppSchema,
  studentExaminationsSchema,
} from '@docversity/validation';
import {
  browser,
  createTestApp,
  errorOf,
  realConfig,
  staff,
  type Staff,
  uniqueCode,
} from '../helpers.js';
import { academicFixture, enrolledStudent, examination, testDb } from './support.js';

let app: INestApplication;
let registrar: Staff;
let examAdmin: Staff;
let viewer: Staff;
let approver: Staff;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [registrar, examAdmin, viewer, approver] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['VIEWER']),
    staff(app, ['APPROVER']),
  ]);
});
afterAll(async () => {
  await app.close();
});

type Agent = ReturnType<typeof browser>;

const studentView = async (agent: Agent) =>
  studentExaminationsSchema.parse(
    (await agent.get('/api/v1/student/examinations').expect(200)).body,
  );

describe('external examination application links', () => {
  it('accepts only https links from authorised staff and shows only active apps to students', async () => {
    const valid = {
      name: 'Synthetic Exam App',
      websiteUrl: 'https://exams.example.test/portal',
      androidUrl: 'https://play.example.test/store/apps/details?id=test.synthetic',
      instructions: 'Synthetic instructions: sign in with your registration number.',
    };
    // Unsafe or non-https schemes and embedded credentials are refused.
    for (const websiteUrl of [
      'http://exams.example.test',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:secret@exams.example.test',
      'https://exams.example.test/a b',
      'ftp://exams.example.test',
      'exams.example.test',
    ]) {
      const response = await examAdmin.post('examination-apps', { ...valid, websiteUrl });
      expect(response.status, websiteUrl).toBe(400);
    }
    expect(
      (await examAdmin.post('examination-apps', { ...valid, iosUrl: 'itms://x' })).status,
    ).toBe(400);

    // Only examinations.manage may configure; reading needs examinations.read.
    for (const member of [registrar, viewer, approver]) {
      expect((await member.post('examination-apps', valid)).status).toBe(403);
    }
    const created = externalExamAppSchema.parse(
      (await examAdmin.post('examination-apps', valid).expect(201)).body,
    );
    expect(created).toMatchObject({ isActive: false, iosUrl: null, androidUrl: valid.androidUrl });
    expect(
      externalExamAppListSchema
        .parse((await viewer.get('examination-apps').expect(200)).body)
        .data.map((a) => a.id),
    ).toContain(created.id);
    expect(
      (await registrar.patch(`examination-apps/${created.id}`, { isActive: true })).status,
    ).toBe(403);

    const fixture = await academicFixture(app, registrar);
    const student = await enrolledStudent(app, registrar, fixture);
    // Inactive apps are not shown.
    expect((await studentView(student.agent)).applications.map((a) => a.id)).not.toContain(
      created.id,
    );
    await examAdmin.patch(`examination-apps/${created.id}`, { isActive: true }).expect(200);
    const shown = (await studentView(student.agent)).applications.find((a) => a.id === created.id);
    expect(shown).toEqual({
      id: created.id,
      name: valid.name,
      websiteUrl: valid.websiteUrl,
      androidUrl: valid.androidUrl,
      iosUrl: null,
      instructions: valid.instructions,
    });
    // Students cannot use staff endpoints.
    expect((await student.agent.get('/api/v1/examination-apps')).status).toBe(401);
    await examAdmin.patch(`examination-apps/${created.id}`, { isActive: false }).expect(200);
    const audit = await testDb().auditLog.findMany({ where: { entityId: created.id } });
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['EXTERNAL_EXAM_APP_CREATED', 'EXTERNAL_EXAM_APP_UPDATED']),
    );
  });
});

describe('examination records follow the curriculum (semester-wise and year-wise)', () => {
  it('labels semesters and years from the curriculum and keeps periods inside it', async () => {
    const semesterCourse = await academicFixture(app, registrar, {
      structure: 'SEMESTER_WISE',
      periods: 2,
    });
    const yearCourse = await academicFixture(app, registrar, {
      structure: 'YEAR_WISE',
      periods: 3,
    });

    const sem = await examination(examAdmin, semesterCourse, { period: 2 });
    expect(sem).toMatchObject({
      status: 'DRAFT',
      kind: 'REGULAR',
      program: { id: semesterCourse.program.id },
      curriculum: { id: semesterCourse.curriculum.id, structureType: 'SEMESTER_WISE' },
      period: { number: 2, label: 'Semester 2' },
      reExamApplicationsOpen: false,
    });
    const year = await examination(examAdmin, yearCourse, { period: 3, kind: 'RE_EXAMINATION' });
    expect(year.period).toEqual({ number: 3, label: 'Year 3' });

    const base = {
      name: 'Synthetic',
      academicSessionId: semesterCourse.master.session.id,
      kind: 'REGULAR',
      examSession: 'Synthetic session',
    };
    // Period outside the curriculum, and a draft curriculum, are refused.
    const outside = await examAdmin.post('examinations', {
      ...base,
      code: uniqueCode('EXM'),
      curriculumId: semesterCourse.curriculum.id,
      periodNumber: 3,
    });
    expect(outside.status).toBe(400);
    expect(errorOf(outside).details?.[0]?.path).toBe('periodNumber');
    const draft = await registrar
      .post(`programs/${semesterCourse.program.id}/curricula`, {
        versionCode: `D${uniqueCode('V')}`.slice(0, 12),
        name: 'Draft syllabus',
      })
      .expect(201);
    const fromDraft = await examAdmin.post('examinations', {
      ...base,
      code: uniqueCode('EXM'),
      curriculumId: (draft.body as { id: string }).id,
      periodNumber: 1,
    });
    expect(fromDraft.status).toBe(400);
    // Duplicate code.
    const duplicate = await examAdmin.post('examinations', {
      ...base,
      code: sem.code,
      curriculumId: semesterCourse.curriculum.id,
      periodNumber: 1,
    });
    expect(duplicate.status).toBe(409);
    // The database refuses a period outside the curriculum even without the API.
    await expect(
      testDb().examination.update({ where: { id: sem.id }, data: { semesterNumber: 9 } }),
    ).rejects.toThrow(/outside the curriculum/);

    // Lists filter by curriculum and kind.
    const list = examinationListSchema.parse(
      (
        await viewer
          .get(`examinations?curriculumId=${yearCourse.curriculum.id}&kind=RE_EXAMINATION`)
          .expect(200)
      ).body,
    );
    expect(list.data.map((e) => e.id)).toEqual([year.id]);
  });

  it('runs the record lifecycle with permissions and audit, and never opens applications on regular exams', async () => {
    const fixture = await academicFixture(app, registrar);
    const regular = await examination(examAdmin, fixture);
    for (const member of [registrar, viewer, approver]) {
      expect((await member.post(`examinations/${regular.id}/open`)).status).toBe(403);
    }
    await examAdmin.patch(`examinations/${regular.id}`, { name: 'Synthetic renamed' }).expect(200);
    await examAdmin.post(`examinations/${regular.id}/open`).expect(200);
    expect((await examAdmin.patch(`examinations/${regular.id}`, { name: 'x' })).status).toBe(409);
    const refused = await examAdmin.post(`examinations/${regular.id}/re-exam-applications`, {
      open: true,
    });
    expect(refused.status).toBe(409);
    await expect(
      testDb().examination.update({
        where: { id: regular.id },
        data: { reExamApplicationsOpen: true },
      }),
    ).rejects.toThrow(/examinations_re_exam_applications_check/);

    const reExam = await examination(examAdmin, fixture, { kind: 'RE_EXAMINATION' });
    // Draft re-exams cannot accept applications.
    expect(
      (await examAdmin.post(`examinations/${reExam.id}/re-exam-applications`, { open: true }))
        .status,
    ).toBe(409);
    await examAdmin.post(`examinations/${reExam.id}/open`).expect(200);
    const accepting = examinationDetailSchema.parse(
      (
        await examAdmin
          .post(`examinations/${reExam.id}/re-exam-applications`, { open: true })
          .expect(200)
      ).body,
    );
    expect(accepting.reExamApplicationsOpen).toBe(true);
    const archived = examinationDetailSchema.parse(
      (await examAdmin.post(`examinations/${reExam.id}/archive`).expect(200)).body,
    );
    expect(archived).toMatchObject({ status: 'ARCHIVED', reExamApplicationsOpen: false });
    expect(archived.history.map((h) => h.action)).toEqual([
      'EXAMINATION_CREATED',
      'EXAMINATION_OPENED',
      'EXAMINATION_RE_EXAM_APPLICATIONS_OPENED',
      'EXAMINATION_ARCHIVED',
    ]);
  });
});

describe('student examinations page', () => {
  it('shows each registration its own curriculum periods and only OPEN records of that curriculum', async () => {
    const yearCourse = await academicFixture(app, registrar, {
      structure: 'YEAR_WISE',
      periods: 2,
    });
    const otherCourse = await academicFixture(app, registrar);
    const student = await enrolledStudent(app, registrar, yearCourse);
    const unassigned = await enrolledStudent(app, registrar, otherCourse, { assign: false });

    const open = await examination(examAdmin, yearCourse, { period: 2, open: true });
    const draft = await examination(examAdmin, yearCourse, { period: 1 });
    const elsewhere = await examination(examAdmin, otherCourse, { open: true });

    const view = await studentView(student.agent);
    expect(view.registrations).toHaveLength(1);
    const [registration] = view.registrations;
    expect(registration).toMatchObject({
      registrationId: student.registrationId,
      registrationNumber: student.registrationNumber,
      program: { id: yearCourse.program.id },
      curriculum: {
        structureType: 'YEAR_WISE',
        periods: [
          { number: 1, label: 'Year 1' },
          { number: 2, label: 'Year 2' },
        ],
      },
    });
    expect(registration?.examinations.map((e) => e.id)).toEqual([open.id]);
    expect(registration?.examinations[0]?.period.label).toBe('Year 2');
    expect(JSON.stringify(view)).not.toContain(draft.id);
    expect(JSON.stringify(view)).not.toContain(elsewhere.id);

    // A registration without an assigned curriculum gets an honest empty state.
    const none = await studentView(unassigned.agent);
    expect(none.registrations[0]).toMatchObject({ curriculum: null, examinations: [] });
    // Anonymous visitors get nothing.
    expect((await browser(app).get('/api/v1/student/examinations')).status).toBe(401);
  });
});
