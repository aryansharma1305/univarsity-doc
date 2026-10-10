import { activate, issueCode, studentCsrf } from '../student-auth/support.js';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  draftImportPlanSchema,
  draftLookupResponseSchema,
  savedDraftSchema,
  type SaveDraft,
} from '@docversity/validation';
import { AuditService } from '../../src/audit/audit.service.js';
import { ResultPreviewStore } from '../../src/result-imports/result-preview.store.js';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import {
  contextFor,
  previewOf,
  resultsFixture,
  TEMPLATE_MAPPING,
  uploadPreview,
  workbook,
} from '../result-imports/support.js';
const openPreviews: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of openPreviews.splice(0))
    await examAdmin.agent
      .delete(`/api/v1/result-imports/previews/${id}`)
      .set('X-CSRF-Token', examAdmin.csrf);
});
let app: INestApplication, registrar: Staff, examAdmin: Staff, other: Staff, viewer: Staff;
beforeAll(async () => {
  app = await createTestApp(realConfig());
  [registrar, examAdmin, other, viewer] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['VIEWER']),
  ]);
});
afterAll(() => app.close());
async function fixture(structure: 'SEMESTER_WISE' | 'YEAR_WISE' = 'SEMESTER_WISE') {
  const f = await resultsFixture(registrar, examAdmin, { structure });
  const exam = await f.examination();
  const student = await f.student();
  const firstSubject = f.subjects[0];
  if (!firstSubject) throw new Error('Missing synthetic subject');
  const line = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: f.curriculum.id, subjectId: firstSubject.id },
  });
  const context = { ...contextFor(f, exam), periodNumber: exam.period.number };
  const body: SaveDraft = {
    context,
    registrationId: student.registrationId,
    programSubjectId: line.id,
    reExamApplicationId: null,
    expectedVersion: null,
    marks: {
      internalMarks: '0',
      externalMarks: '60.25',
      practicalMarks: null,
      otherMarks: null,
      totalMarks: null,
    },
  };
  return { f, exam, student, line, body, subjectCode: firstSubject.code };
}
async function preview(f: Awaited<ReturnType<typeof fixture>>, rows: (string | number | null)[][]) {
  const p = previewOf(
    await uploadPreview(examAdmin, contextFor(f.f, f.exam), await workbook(rows)).expect(201),
  );
  openPreviews.push(p.id);
  await examAdmin.post(`result-imports/previews/${p.id}/validate`, TEMPLATE_MAPPING).expect(200);
  return p;
}
async function plan(id: string) {
  return draftImportPlanSchema.parse(
    (await examAdmin.post(`draft-results/imports/${id}/plan`).expect(201)).body,
  );
}
const confirmed = (digest: string, batchId = randomUUID()) => ({
  digest,
  batchId,
  confirmed: true,
});
describe('safe internal draft persistence', () => {
  for (const structure of ['SEMESTER_WISE', 'YEAR_WISE'] as const) {
    it(`${structure}: saves and edits zero versus missing components with atomic audit`, async () => {
      const f = await fixture(structure);
      const lookup = draftLookupResponseSchema.parse(
        (
          await examAdmin
            .post('draft-results/lookup', {
              ...f.body.context,
              registrationNumber: f.student.registrationNumber,
            })
            .expect(201)
        ).body,
      );
      expect(lookup.subjects[0]?.attemptNumber).toBe(1);
      const saved = savedDraftSchema.parse(
        (await examAdmin.post('draft-results', f.body).expect(201)).body,
      );
      expect(saved.marks.internalMarks).toBe('0');
      expect(saved.marks.totalMarks).toBeNull();
      expect(saved.version).toBe(1);
      const changed = savedDraftSchema.parse(
        (
          await other
            .post('draft-results', {
              ...f.body,
              expectedVersion: saved.version,
              marks: { ...f.body.marks, externalMarks: null },
            })
            .expect(201)
        ).body,
      );
      expect(changed.version).toBe(2);
      expect(changed.issues.some((i) => i.code === 'REQUIRED_COMPONENT_MISSING')).toBe(true);
      const item = await testDb().resultItem.findUniqueOrThrow({
        where: { id: saved.id },
        include: { result: true },
      });
      expect(item.status).toBeNull();
      expect(item.result.publicationStatus).toBe('DRAFT');
      expect(item.grade).toBeNull();
      expect(item.result.sgpa).toBeNull();
      const audit = await testDb().auditLog.findMany({
        where: { entityId: saved.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual(['RESULT_DRAFT_CREATED', 'RESULT_DRAFT_UPDATED']);
      expect(audit[1]?.actorUserId).toBe(other.user.id);
      expect(audit[1]?.metadata).toMatchObject({
        previous: { externalMarks: '60.25' },
        next: { externalMarks: null },
      });
      await examAdmin.get(`draft-results/${saved.id}/history`).expect(200);
    });
  }
  it('rejects boundaries, precision, unknown components and ineligible enrollment', async () => {
    const f = await fixture();
    for (const value of ['30.01', '-1', '2.123', '10000', 'NaN'])
      await examAdmin
        .post('draft-results', { ...f.body, marks: { ...f.body.marks, internalMarks: value } })
        .expect(400);
    await examAdmin
      .post('draft-results', { ...f.body, marks: { ...f.body.marks, otherMarks: '1' } })
      .expect(400);
    const unassigned = await f.f.student({ curriculumId: null });
    await examAdmin
      .post('draft-results', { ...f.body, registrationId: unassigned.registrationId })
      .expect(400);
    const wrong = await testDb().programSubject.findFirstOrThrow({
      where: { curriculumId: f.f.curriculum.id, semesterNumber: 2 },
    });
    await examAdmin.post('draft-results', { ...f.body, programSubjectId: wrong.id }).expect(400);
    await examAdmin
      .post('draft-results', { ...f.body, context: { ...f.body.context, periodNumber: 2 } })
      .expect(400);
    await testDb().studentRegistration.update({
      where: { id: f.student.registrationId },
      data: { status: 'SUSPENDED' },
    });
    await examAdmin.post('draft-results', f.body).expect(400);
    expect(await testDb().result.count({ where: { examinationId: f.exam.id } })).toBe(0);
  });
  it('accepts maximum and two-decimal component values', async () => {
    const f = await fixture();
    await examAdmin
      .post('draft-results', {
        ...f.body,
        marks: { ...f.body.marks, internalMarks: '30', externalMarks: '70', totalMarks: '100' },
      })
      .expect(201);
  });
  it('rejects duplicate manual creation and concurrent stale edits', async () => {
    const f = await fixture();
    const saved = savedDraftSchema.parse(
      (await examAdmin.post('draft-results', f.body).expect(201)).body,
    );
    await examAdmin.post('draft-results', f.body).expect(409);
    const responses = await Promise.all([
      examAdmin.post('draft-results', {
        ...f.body,
        expectedVersion: saved.version,
        marks: { ...f.body.marks, internalMarks: '10' },
      }),
      other.post('draft-results', {
        ...f.body,
        expectedVersion: saved.version,
        marks: { ...f.body.marks, internalMarks: '20' },
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await testDb().resultItem.count({ where: { resultId: saved.resultId } })).toBe(1);
  });
  it('protects locked/published marks and database ungraded lifecycle guard', async () => {
    const f = await fixture();
    const saved = savedDraftSchema.parse(
      (await examAdmin.post('draft-results', f.body).expect(201)).body,
    );
    await expect(
      testDb().result.update({
        where: { id: saved.resultId },
        data: { publicationStatus: 'UNDER_REVIEW' },
      }),
    ).rejects.toThrow('ungraded_result_guard');
    await testDb().resultItem.update({ where: { id: saved.id }, data: { status: 'PASS' } });
    await testDb().result.update({
      where: { id: saved.resultId },
      data: { publicationStatus: 'PUBLISHED', publishedAt: new Date(), outcome: 'PASS' },
    });
    const before = await testDb().resultItem.findUnique({ where: { id: saved.id } });
    await examAdmin
      .post('draft-results', {
        ...f.body,
        expectedVersion: saved.version,
        marks: { ...f.body.marks, externalMarks: '5' },
      })
      .expect(409);
    expect(await testDb().resultItem.findUnique({ where: { id: saved.id } })).toEqual(before);
    await expect(
      testDb().resultItem.update({ where: { id: saved.id }, data: { externalMarks: '5' } }),
    ).rejects.toThrow();
    await examAdmin.get(`draft-results/${saved.id}`).expect(404);
  });
  it('rolls back result/item writes if audit fails and safely retries', async () => {
    const f = await fixture();
    const audit = app.get(AuditService);
    const spy = vi
      .spyOn(audit, 'writeAuditEvent')
      .mockRejectedValueOnce(new Error('synthetic audit outage'));
    await examAdmin.post('draft-results', f.body).expect(500);
    spy.mockRestore();
    expect(await testDb().result.count({ where: { examinationId: f.exam.id } })).toBe(0);
    await examAdmin.post('draft-results', f.body).expect(201);
  });
  it('enforces API write permissions, authentication and CSRF', async () => {
    const f = await fixture();
    await viewer.post('draft-results', f.body).expect(403);
    await viewer
      .post('draft-results/lookup', {
        ...f.body.context,
        registrationNumber: f.student.registrationNumber,
      })
      .expect(403);
    await browser(app).post('/api/v1/draft-results').send(f.body).expect(401);
    await examAdmin.agent.post('/api/v1/draft-results').send(f.body).expect(403);
    await viewer.get('draft-results').expect(200);
  });
  it('imports only freshly valid rows with receipt replay and cross-preview duplicate safety', async () => {
    const f = await fixture();
    const bytes = [
      [f.student.registrationNumber, f.subjectCode, '0', '65.12'],
      ['UNKNOWN', f.subjectCode, '20', '40'],
    ];
    const p = await preview(f, bytes);
    const review = await plan(p.id);
    expect(review.counts).toEqual({ created: 1, updated: 0, skipped: 0, rejected: 1 });
    const request = confirmed(review.digest);
    const response = await examAdmin
      .post(`draft-results/imports/${p.id}/commit`, request)
      .expect(201);
    expect(response.body).toMatchObject({ batchId: request.batchId, counts: review.counts });
    const replay = await examAdmin
      .post(`draft-results/imports/${p.id}/commit`, request)
      .expect(201);
    expect(replay.body).toEqual(response.body);
    expect(
      await testDb().resultItem.count({ where: { result: { examinationId: f.exam.id } } }),
    ).toBe(1);
    const p2 = await preview(f, bytes);
    expect((await plan(p2.id)).counts).toEqual({ created: 0, updated: 0, skipped: 1, rejected: 1 });
    await examAdmin.post(`draft-results/imports/${p2.id}/commit`, request).expect(409);
    expect(
      await testDb().auditLog.count({
        where: { entityId: request.batchId, action: 'RESULT_DRAFT_BATCH_SAVED' },
      }),
    ).toBe(1);
  });
  it('does not overwrite conflicting drafts and detects changed plans', async () => {
    const f = await fixture();
    const p = await preview(f, [[f.student.registrationNumber, f.subjectCode, '15', '50']]);
    const review = await plan(p.id);
    await examAdmin.post('draft-results', f.body).expect(201);
    await examAdmin
      .post(`draft-results/imports/${p.id}/commit`, confirmed(review.digest))
      .expect(409);
    const fresh = await plan(p.id);
    expect(fresh.counts.rejected).toBe(1);
    expect(fresh.rows[0]?.issues.some((i) => i.code === 'DRAFT_CONFLICT')).toBe(true);
  });
  it('checks preview owner, explicit confirmation, discard and expiry', async () => {
    const f = await fixture();
    const p = await preview(f, [[f.student.registrationNumber, f.subjectCode, '15', '50']]);
    const review = await plan(p.id);
    await other.post(`draft-results/imports/${p.id}/plan`).expect(404);
    await viewer.post(`draft-results/imports/${p.id}/plan`).expect(403);
    await other.post(`draft-results/imports/${p.id}/commit`, confirmed(review.digest)).expect(404);
    await examAdmin
      .post(`draft-results/imports/${p.id}/commit`, {
        batchId: randomUUID(),
        digest: review.digest,
        confirmed: false,
      })
      .expect(400);
    await examAdmin.agent
      .delete(`/api/v1/result-imports/previews/${p.id}`)
      .set('X-CSRF-Token', examAdmin.csrf)
      .expect(204);
    await examAdmin
      .post(`draft-results/imports/${p.id}/commit`, confirmed(review.digest))
      .expect(404);
    const p2 = await preview(f, [[f.student.registrationNumber, f.subjectCode, '15', '50']]);
    const store = app.get(ResultPreviewStore);
    const spy = vi.spyOn(store, 'meta').mockResolvedValueOnce(null);
    await examAdmin.post(`draft-results/imports/${p2.id}/plan`).expect(404);
    spy.mockRestore();
  });
  it('rolls back a whole Excel batch when a later audit fails', async () => {
    const f = await fixture();
    const second = await f.f.student();
    const p = await preview(f, [
      [f.student.registrationNumber, f.subjectCode, '15', '50'],
      [second.registrationNumber, f.subjectCode, '20', '60'],
    ]);
    const review = await plan(p.id);
    const audit = app.get(AuditService),
      original = audit.writeAuditEvent.bind(audit);
    let calls = 0;
    const spy = vi.spyOn(audit, 'writeAuditEvent').mockImplementation(async (...args) => {
      calls++;
      if (calls === 2) throw new Error('synthetic second audit failure');
      return original(...args);
    });
    const request = confirmed(review.digest);
    await examAdmin.post(`draft-results/imports/${p.id}/commit`, request).expect(500);
    spy.mockRestore();
    expect(await testDb().result.count({ where: { examinationId: f.exam.id } })).toBe(0);
    expect(await testDb().resultDraftBatch.count({ where: { id: request.batchId } })).toBe(0);
    await examAdmin.post(`draft-results/imports/${p.id}/commit`, request).expect(201);
    expect(await testDb().result.count({ where: { examinationId: f.exam.id } })).toBe(2);
  });
  it('rejects enrollment changed after validation', async () => {
    const f = await fixture();
    const p = await preview(f, [[f.student.registrationNumber, f.subjectCode, '15', '50']]);
    const old = await plan(p.id);
    await testDb().studentRegistration.update({
      where: { id: f.student.registrationId },
      data: { status: 'SUSPENDED' },
    });
    await examAdmin.post(`draft-results/imports/${p.id}/commit`, confirmed(old.digest)).expect(409);
    expect((await plan(p.id)).counts.rejected).toBe(1);
  });
  it('conflicting concurrent imports cannot duplicate records', async () => {
    const f = await fixture();
    const p = await preview(f, [[f.student.registrationNumber, f.subjectCode, '15', '50']]);
    const review = await plan(p.id);
    const responses = await Promise.all([
      examAdmin.post(`draft-results/imports/${p.id}/commit`, confirmed(review.digest)),
      examAdmin.post(`draft-results/imports/${p.id}/commit`, confirmed(review.digest)),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await testDb().resultItem.count({ where: { result: { examinationId: f.exam.id } } }),
    ).toBe(1);
  });
  it('links approved re-exam applications and preserves their exact attempt, separate from regular marks', async () => {
    const f = await fixture();
    const code = await issueCode(registrar, f.student.registrationId);
    const agent = browser(app);
    expect(
      (
        await activate(agent, {
          registrationNumber: f.student.registrationNumber,
          activationCode: code,
        })
      ).status,
    ).toBe(200);
    const regular = savedDraftSchema.parse(
      (await examAdmin.post('draft-results', f.body).expect(201)).body,
    );
    const exams = [];
    for (let i = 0; i < 2; i++) {
      const response = await examAdmin
        .post('examinations', {
          code: `RE-${randomUUID().slice(0, 8)}`,
          name: 'Synthetic re-exam',
          curriculumId: f.f.curriculum.id,
          academicSessionId: f.f.master.session.id,
          periodNumber: 1,
          kind: 'RE_EXAMINATION',
          examSession: 'Synthetic re-exam 2026',
        })
        .expect(201);
      const examId = (response.body as { id: string }).id;
      await examAdmin.post(`examinations/${examId}/open`).expect(200);
      await examAdmin
        .post(`examinations/${examId}/re-exam-applications`, { open: true })
        .expect(200);
      const csrf = await studentCsrf(agent);
      const applied = await agent
        .post('/api/v1/student/re-exam-applications')
        .set('X-CSRF-Token', csrf)
        .send({
          registrationId: f.student.registrationId,
          examinationId: examId,
          programSubjectId: f.line.id,
        })
        .expect(201);
      const application = applied.body as { id: string; attemptNumber: number };
      const body = {
        ...f.body,
        context: { ...f.body.context, examinationId: examId },
        reExamApplicationId: application.id,
      };
      await examAdmin.post('draft-results', body).expect(400);
      await examAdmin.post(`re-exam-applications/${application.id}/approve`, {}).expect(200);
      const saved = savedDraftSchema.parse(
        (await examAdmin.post('draft-results', body).expect(201)).body,
      );
      expect(saved.attemptNumber).toBe(application.attemptNumber);
      expect(saved.attemptNumber).toBe(i + 1);
      expect(saved.reExamApplicationId).toBe(application.id);
      expect(saved.resultId).not.toBe(regular.resultId);
      exams.push(examId);
      await examAdmin
        .post('draft-results', {
          ...body,
          expectedVersion: saved.version,
          reExamApplicationId: null,
        })
        .expect(400);
    }
    expect(
      await testDb().result.count({ where: { studentRegistrationId: f.student.registrationId } }),
    ).toBe(3);
  });
  it('rejects all conflicting duplicate rows rather than importing the first', async () => {
    const f = await fixture();
    const p = await preview(f, [
      [f.student.registrationNumber, f.subjectCode, '15', '50'],
      [f.student.registrationNumber, f.subjectCode, '20', '60'],
    ]);
    const reviewed = await plan(p.id);
    expect(reviewed.counts).toEqual({ created: 0, updated: 0, skipped: 0, rejected: 2 });
  });
  it('rolls back if the preview expires during a commit', async () => {
    const f = await fixture();
    const p = await preview(f, [[f.student.registrationNumber, f.subjectCode, '15', '50']]);
    const reviewed = await plan(p.id);
    const store = app.get(ResultPreviewStore),
      original = store.meta.bind(store);
    let reads = 0;
    vi.spyOn(store, 'meta').mockImplementation(async (...args) => {
      reads++;
      return reads >= 3 ? null : original(...args);
    });
    await examAdmin
      .post(`draft-results/imports/${p.id}/commit`, confirmed(reviewed.digest))
      .expect(409);
    expect(await testDb().result.count({ where: { examinationId: f.exam.id } })).toBe(0);
  });
  it('durable import receipts cannot be modified or deleted and expired previews cannot replay them', async () => {
    const f = await fixture();
    const p = await preview(f, [[f.student.registrationNumber, f.subjectCode, '15', '50']]);
    const review = await plan(p.id),
      request = confirmed(review.digest);
    await examAdmin.post(`draft-results/imports/${p.id}/commit`, request).expect(201);
    await expect(
      testDb().resultDraftBatch.update({ where: { id: request.batchId }, data: { outcome: {} } }),
    ).rejects.toThrow('append-only');
    await expect(
      testDb().resultDraftBatch.delete({ where: { id: request.batchId } }),
    ).rejects.toThrow('append-only');
    vi.spyOn(app.get(ResultPreviewStore), 'meta').mockResolvedValueOnce(null);
    await examAdmin.post(`draft-results/imports/${p.id}/commit`, request).expect(404);
  });
  it('rejects an all-invalid batch without persisting an empty saved receipt', async () => {
    const f = await fixture();
    const p = await preview(f, [['UNKNOWN', f.subjectCode, '15', '50']]);
    const reviewed = await plan(p.id),
      request = confirmed(reviewed.digest);
    expect(reviewed.counts.rejected).toBe(1);
    await examAdmin.post(`draft-results/imports/${p.id}/commit`, request).expect(409);
    expect(await testDb().resultDraftBatch.count({ where: { id: request.batchId } })).toBe(0);
  });
  it('invalidates legacy draft calculations when its marks change without calculating replacement grades', async () => {
    const f = await fixture();
    const saved = savedDraftSchema.parse(
      (await examAdmin.post('draft-results', f.body).expect(201)).body,
    );
    await testDb().result.update({
      where: { id: saved.resultId },
      data: {
        totalMarks: '90',
        maxMarks: '100',
        sgpa: '9',
        cgpa: '8',
        outcome: 'PASS',
        calculationSnapshot: { legacy: true },
      },
    });
    await testDb().resultItem.update({
      where: { id: saved.id },
      data: { status: 'PASS', grade: 'A', gradePoint: '9', creditsEarned: '4' },
    });
    await examAdmin
      .post('draft-results', {
        ...f.body,
        expectedVersion: saved.version,
        marks: { ...f.body.marks, externalMarks: '30' },
      })
      .expect(201);
    const result = await testDb().result.findUniqueOrThrow({
      where: { id: saved.resultId },
      include: { items: true },
    });
    expect([
      result.totalMarks,
      result.maxMarks,
      result.sgpa,
      result.cgpa,
      result.outcome,
      result.calculationSnapshot,
      result.items[0]?.grade,
      result.items[0]?.status,
    ]).toEqual([null, null, null, null, null, null, null, null]);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { entityId: saved.id, action: 'RESULT_DRAFT_UPDATED' },
    });
    expect(audit.metadata).toMatchObject({
      derivedCalculationsCleared: true,
      previousDerived: { sgpa: '9', outcome: 'PASS' },
    });
  });
});
