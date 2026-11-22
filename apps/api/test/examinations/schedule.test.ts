import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { examinationScheduleSchema, studentExaminationsSchema } from '@docversity/validation';
import { createTestApp, errorOf, realConfig, staff, type Staff } from '../helpers.js';
import { academicFixture, enrolledStudent, examination, testDb } from './support.js';

let app: INestApplication;
let registrar: Staff;
let examAdmin: Staff;
let viewer: Staff;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [registrar, examAdmin, viewer] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['VIEWER']),
  ]);
});
afterAll(async () => {
  await app.close();
});

const read = async (who: Staff, id: string) =>
  examinationScheduleSchema.parse((await who.get(`examinations/${id}/schedule`).expect(200)).body);

describe('examination timetable', () => {
  it('schedules period subjects, rejects clashes and outsiders, publishes to students only', async () => {
    const fixture = await academicFixture(app, registrar, { subjectsPerPeriod: 2 });
    const student = await enrolledStudent(app, registrar, fixture);
    const exam = await examination(examAdmin, fixture, { period: 1, open: true });
    const draft = await read(viewer, exam.id);
    expect(draft.publishedAt).toBeNull();
    expect(draft.subjects).toHaveLength(2);
    const [first, second] = draft.subjects;
    if (!first || !second) throw new Error('two subjects expected');

    const items = [
      {
        programSubjectId: first.programSubjectId,
        examDate: '2026-12-01',
        startTime: '09:30',
        endTime: '12:30',
        venue: 'Hall A',
      },
      {
        programSubjectId: second.programSubjectId,
        examDate: '2026-12-01',
        startTime: '14:00',
        endTime: '17:00',
        venue: null,
      },
    ];
    // Only examinations.manage may change it.
    expect((await viewer.patch(`examinations/${exam.id}/schedule`, { items })).status).toBe(403);
    expect((await registrar.patch(`examinations/${exam.id}/schedule`, { items })).status).toBe(403);
    // Same-day overlap.
    const clash = await examAdmin.patch(`examinations/${exam.id}/schedule`, {
      items: [items[0], { ...items[1], startTime: '12:00' }],
    });
    expect(clash.status).toBe(400);
    expect(errorOf(clash).details).toEqual([
      {
        path: 'items.1.startTime',
        message: 'This sitting overlaps another sitting on the same day.',
      },
    ]);
    // A subject from another period is refused; end before start is refused.
    const period2 = (await read(viewer, (await examination(examAdmin, fixture, { period: 2 })).id))
      .subjects[0];
    expect(
      (
        await examAdmin.patch(`examinations/${exam.id}/schedule`, {
          items: [{ ...items[0], programSubjectId: period2?.programSubjectId }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await examAdmin.patch(`examinations/${exam.id}/schedule`, {
          items: [{ ...items[0], endTime: '08:00' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await examAdmin.patch(`examinations/${exam.id}/schedule`, { items: [items[0], items[0]] }))
        .status,
    ).toBe(400);

    const saved = examinationScheduleSchema.parse(
      (await examAdmin.patch(`examinations/${exam.id}/schedule`, { items }).expect(200)).body,
    );
    expect(saved.items.map((i) => [i.subject.code, i.examDate, i.startTime, i.venue])).toEqual([
      [first.code, '2026-12-01', '09:30', 'Hall A'],
      [second.code, '2026-12-01', '14:00', null],
    ]);
    // Not visible to the student until published.
    const before = studentExaminationsSchema.parse(
      (await student.agent.get('/api/v1/student/examinations').expect(200)).body,
    );
    expect(
      before.registrations[0]?.examinations.find((e) => e.id === exam.id)?.schedule,
    ).toBeNull();

    await examAdmin.post(`examinations/${exam.id}/schedule/publish`).expect(200);
    expect((await examAdmin.post(`examinations/${exam.id}/schedule/publish`)).status).toBe(409);
    const after = studentExaminationsSchema.parse(
      (await student.agent.get('/api/v1/student/examinations').expect(200)).body,
    );
    const shown = after.registrations[0]?.examinations.find((e) => e.id === exam.id)?.schedule;
    expect(shown?.items.map((i) => i.subject.code)).toEqual([first.code, second.code]);

    // Updates after publication stay published and are recorded.
    await examAdmin.patch(`examinations/${exam.id}/schedule`, { items: [items[0]] }).expect(200);
    await examAdmin.post(`examinations/${exam.id}/schedule/unpublish`).expect(200);
    const audits = await testDb().auditLog.findMany({
      where: { entityId: exam.id, action: { startsWith: 'EXAMINATION_SCHEDULE' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => [a.action, a.metadata])).toEqual([
      ['EXAMINATION_SCHEDULE_UPDATED', { items: 2, published: false }],
      ['EXAMINATION_SCHEDULE_PUBLISHED', {}],
      ['EXAMINATION_SCHEDULE_UPDATED', { items: 1, published: true }],
      ['EXAMINATION_SCHEDULE_UNPUBLISHED', {}],
    ]);
    const detail = (await examAdmin.get(`examinations/${exam.id}`).expect(200)).body as {
      history: { summary: string }[];
    };
    expect(detail.history.map((h) => h.summary)).toContain('Timetable published to students');
  });

  it('only publishes OPEN examinations with sittings, and archived timetables are read-only', async () => {
    const fixture = await academicFixture(app, registrar, { subjectsPerPeriod: 1 });
    const exam = await examination(examAdmin, fixture, { period: 1 });
    const subject = (await read(examAdmin, exam.id)).subjects[0];
    expect(
      errorOf(await examAdmin.post(`examinations/${exam.id}/schedule/publish`)).message,
    ).toMatch(/Open the examination/);
    await examAdmin.post(`examinations/${exam.id}/open`).expect(200);
    expect(
      errorOf(await examAdmin.post(`examinations/${exam.id}/schedule/publish`)).message,
    ).toMatch(/at least one sitting/);
    await examAdmin.post(`examinations/${exam.id}/archive`).expect(200);
    const locked = await examAdmin.patch(`examinations/${exam.id}/schedule`, {
      items: [
        {
          programSubjectId: subject?.programSubjectId,
          examDate: '2026-12-02',
          startTime: '10:00',
          endTime: '11:00',
          venue: null,
        },
      ],
    });
    expect(locked.status).toBe(409);
    // Archived: publication state cannot change either.
    expect((await examAdmin.post(`examinations/${exam.id}/schedule/publish`)).status).toBe(409);
    expect((await examAdmin.post(`examinations/${exam.id}/schedule/unpublish`)).status).toBe(409);
  });

  it('keeps a published timetable non-empty and blocks period changes that would leave it stale', async () => {
    const fixture = await academicFixture(app, registrar, { subjectsPerPeriod: 1 });
    const exam = await examination(examAdmin, fixture, { period: 1 });
    const subject = (await read(examAdmin, exam.id)).subjects[0];
    const items = [
      {
        programSubjectId: subject?.programSubjectId,
        examDate: '2026-12-03',
        startTime: '10:00',
        endTime: '13:00',
        venue: null,
      },
    ];
    await examAdmin.patch(`examinations/${exam.id}/schedule`, { items }).expect(200);
    // Draft record: moving it to another period while sittings exist is refused.
    const moved = await examAdmin.patch(`examinations/${exam.id}`, { periodNumber: 2 });
    expect(moved.status).toBe(409);
    expect(errorOf(moved).message).toMatch(/Clear the timetable/);
    await examAdmin.patch(`examinations/${exam.id}/schedule`, { items: [] }).expect(200);
    await examAdmin.patch(`examinations/${exam.id}`, { periodNumber: 2 }).expect(200);
    await examAdmin.patch(`examinations/${exam.id}`, { periodNumber: 1 }).expect(200);

    await examAdmin.post(`examinations/${exam.id}/open`).expect(200);
    await examAdmin.patch(`examinations/${exam.id}/schedule`, { items }).expect(200);
    await examAdmin.post(`examinations/${exam.id}/schedule/publish`).expect(200);
    // Published: emptying it is refused; withdraw first.
    const emptied = await examAdmin.patch(`examinations/${exam.id}/schedule`, { items: [] });
    expect(emptied.status).toBe(409);
    expect(errorOf(emptied).message).toMatch(/Withdraw the published timetable/);
    expect((await read(examAdmin, exam.id)).items).toHaveLength(1);
    await examAdmin.post(`examinations/${exam.id}/schedule/unpublish`).expect(200);
    await examAdmin.patch(`examinations/${exam.id}/schedule`, { items: [] }).expect(200);
  });
});
