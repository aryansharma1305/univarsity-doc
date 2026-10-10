import { activate, issueCode, studentCsrf } from '../student-auth/support.js';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  reviewedResultSchema,
  reviewReceiptSchema,
  reviewVersionSchema,
  reviewQueueSchema,
  savedDraftSchema,
  type SaveDraft,
} from '@docversity/validation';
import {
  ResultReviewService,
  RESULT_REVIEW_POLICY,
} from '../../src/results/result-review.service.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { contextFor, resultsFixture } from '../result-imports/support.js';
const logs: string[] = [];
let app: INestApplication,
  maker: Staff,
  registrar: Staff,
  checker: Staff,
  viewer: Staff,
  publisher: Staff,
  superMaker: Staff;
beforeAll(async () => {
  app = await createTestApp(realConfig(), { logSink: (line) => logs.push(line) });
  [maker, registrar, checker, viewer, publisher, superMaker] = await Promise.all([
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['REGISTRAR']),
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['VIEWER']),
    staff(app, ['APPROVER']),
    staff(app, ['SUPER_ADMIN']),
  ]);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());
async function fixture(
  structure: 'SEMESTER_WISE' | 'YEAR_WISE' = 'SEMESTER_WISE',
  multiple = false,
) {
  const f = await resultsFixture(registrar, maker, {
    structure,
    subjects: Array.from({ length: multiple ? 2 : 1 }, () => ({
      period: 1,
      maxMarks: 100,
      components: [
        { name: 'Internal', maxMarks: 30 },
        { name: 'External', maxMarks: 70 },
      ],
    })),
  });
  const exam = await f.examination();
  const student = await f.student();
  const line = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: f.curriculum.id },
  });
  const body: SaveDraft = {
    context: { ...contextFor(f, exam), periodNumber: exam.period.number },
    registrationId: student.registrationId,
    programSubjectId: line.id,
    reExamApplicationId: null,
    expectedVersion: null,
    marks: {
      internalMarks: '0',
      externalMarks: '70',
      practicalMarks: null,
      otherMarks: null,
      totalMarks: null,
    },
  };
  const draft = savedDraftSchema.parse((await maker.post('draft-results', body).expect(201)).body);
  return { f, exam, student, line, body, draft };
}
const action = (version: number, reason?: string) => ({
  requestId: randomUUID(),
  expectedVersion: version,
  confirmed: true,
  ...(reason ? { reason } : {}),
});
describe('internal result review versions', () => {
  it('blocks review and approval without an explicitly established policy', async () => {
    const f = await fixture();
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(200);
    for (const step of ['approve', 'return', 'reject'])
      await checker
        .post(`result-review/${f.draft.resultId}/${step}`, action(2, 'Synthetic reason'))
        .expect(409);
    await publisher.post(`result-review/${f.draft.resultId}/approve`, action(2)).expect(403);
  });
  it('under synthetic authorized policy, returns for correction, preserves versions and approves without publishing', async () => {
    vi.spyOn(app.get(ResultReviewService), 'policy').mockReturnValue({
      ...RESULT_REVIEW_POLICY,
      approvalEnabled: true,
      approvalBlockers: [],
    });
    const f = await fixture();
    const submit = action(1);
    await maker.post(`result-review/${f.draft.resultId}/submit`, submit).expect(200);
    await checker.post(`result-review/${f.draft.resultId}/return`, action(2)).expect(400);
    const returned = action(2, 'Correct the entered external marks');
    await checker.post(`result-review/${f.draft.resultId}/return`, returned).expect(200);
    await checker.post(`result-review/${f.draft.resultId}/return`, returned).expect(200);
    await maker
      .post('draft-results', {
        ...f.body,
        expectedVersion: 3,
        marks: { ...f.body.marks, externalMarks: '50' },
      })
      .expect(201);
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(4)).expect(200);
    const approve = action(5);
    await checker.post(`result-review/${f.draft.resultId}/approve`, approve).expect(200);
    await checker.post(`result-review/${f.draft.resultId}/approve`, approve).expect(200);
    const r = await testDb().result.findUniqueOrThrow({ where: { id: f.draft.resultId } });
    expect(r.publicationStatus).toBe('APPROVED');
    expect(r.outcome).toBeNull();
    expect(r.publishedAt).toBeNull();
    expect(r.version).toBe(6);
    await maker.post('draft-results', { ...f.body, expectedVersion: 6 }).expect(409);
    await checker.post(`result-review/${f.draft.resultId}/publish`, action(6)).expect(409);
    const previous = reviewVersionSchema.parse(
      (
        await checker
          .get(`result-review/${f.draft.resultId}/versions/${submit.requestId}`)
          .expect(200)
      ).body,
    );
    expect(previous.subjects[0]?.marks.externalMarks).toBe('70');
    await expect(
      testDb().resultItem.update({ where: { id: f.draft.id }, data: { externalMarks: 1 } }),
    ).rejects.toThrow();
    await expect(
      testDb().result.update({ where: { id: f.draft.resultId }, data: { totalMarks: 1 } }),
    ).rejects.toThrow();
  });
  it('under synthetic authorized policy, requires checker different from every editor including SUPER_ADMIN', async () => {
    vi.spyOn(app.get(ResultReviewService), 'policy').mockReturnValue({
      ...RESULT_REVIEW_POLICY,
      approvalEnabled: true,
      approvalBlockers: [],
    });
    const f = await fixture();
    await superMaker.post('draft-results', { ...f.body, expectedVersion: 1 }).expect(201);
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(2)).expect(200);
    await superMaker.post(`result-review/${f.draft.resultId}/approve`, action(3)).expect(403);
    await maker.post(`result-review/${f.draft.resultId}/approve`, action(3)).expect(403);
    await checker.post(`result-review/${f.draft.resultId}/approve`, action(3)).expect(200);
  });
  it('under synthetic authorized policy, concurrent approvals produce one immutable event', async () => {
    vi.spyOn(app.get(ResultReviewService), 'policy').mockReturnValue({
      ...RESULT_REVIEW_POLICY,
      approvalEnabled: true,
      approvalBlockers: [],
    });
    const f = await fixture();
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(200);
    const responses = await Promise.all([
      checker.post(`result-review/${f.draft.resultId}/approve`, action(2)),
      checker.post(`result-review/${f.draft.resultId}/approve`, action(2)),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await testDb().resultReviewEvent.count({
        where: { resultId: f.draft.resultId, action: 'APPROVE' },
      }),
    ).toBe(1);
  });
  it('under synthetic authorized policy, rejection requires a reason and retains reviewed marks', async () => {
    vi.spyOn(app.get(ResultReviewService), 'policy').mockReturnValue({
      ...RESULT_REVIEW_POLICY,
      approvalEnabled: true,
      approvalBlockers: [],
    });
    const f = await fixture();
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(200);
    await checker.post(`result-review/${f.draft.resultId}/reject`, action(2)).expect(400);
    await checker
      .post(
        `result-review/${f.draft.resultId}/reject`,
        action(2, 'Synthetic eligibility correction'),
      )
      .expect(200);
    expect(
      (await testDb().result.findUniqueOrThrow({ where: { id: f.draft.resultId } }))
        .publicationStatus,
    ).toBe('DRAFT');
    expect(await testDb().resultReviewEvent.count({ where: { resultId: f.draft.resultId } })).toBe(
      2,
    );
  });

  it('preserves APPROVED re-exam application attempts exactly through submission without altering regular results', async () => {
    const f = await fixture();
    const student = browser(app);
    const code = await issueCode(registrar, f.student.registrationId);
    expect(
      (
        await activate(student, {
          registrationNumber: f.student.registrationNumber,
          activationCode: code,
        })
      ).status,
    ).toBe(200);
    for (let n = 1; n <= 2; n++) {
      const exam = (
        await maker
          .post('examinations', {
            code: `RR-${randomUUID().slice(0, 8)}`,
            name: 'Synthetic review re-exam',
            curriculumId: f.f.curriculum.id,
            academicSessionId: f.f.master.session.id,
            periodNumber: 1,
            kind: 'RE_EXAMINATION',
            examSession: 'Synthetic re-exam',
          })
          .expect(201)
      ).body as { id: string };
      await maker.post(`examinations/${exam.id}/open`).expect(200);
      await maker.post(`examinations/${exam.id}/re-exam-applications`, { open: true }).expect(200);
      const csrf = await studentCsrf(student);
      const application = (
        await student
          .post('/api/v1/student/re-exam-applications')
          .set('X-CSRF-Token', csrf)
          .send({
            registrationId: f.student.registrationId,
            examinationId: exam.id,
            programSubjectId: f.line.id,
          })
          .expect(201)
      ).body as { id: string; attemptNumber: number };
      await maker.post(`re-exam-applications/${application.id}/approve`, {}).expect(200);
      const draft = savedDraftSchema.parse(
        (
          await maker
            .post('draft-results', {
              ...f.body,
              context: { ...f.body.context, examinationId: exam.id },
              reExamApplicationId: application.id,
            })
            .expect(201)
        ).body,
      );
      await maker.post(`result-review/${draft.resultId}/submit`, action(1)).expect(200);
      const detail = reviewedResultSchema.parse(
        (await checker.get(`result-review/${draft.resultId}`).expect(200)).body,
      );
      expect(detail.attemptNumber).toBe(application.attemptNumber);
      expect(detail.attemptNumber).toBe(n);
      expect(detail.subjects[0]?.reExamApplicationId).toBe(application.id);
    }
    expect(
      (await testDb().result.findUniqueOrThrow({ where: { id: f.draft.resultId } }))
        .publicationStatus,
    ).toBe('DRAFT');
    await student.get(`/api/v1/result-review/${f.draft.resultId}`).expect(401);
    await student.get('/api/v1/result-review').expect(401);
  });
  it('requires authenticated staff, CSRF and explicit confirmation', async () => {
    const f = await fixture();
    await browser(app).get(`/api/v1/result-review/${f.draft.resultId}`).expect(401);
    await maker.agent
      .post(`/api/v1/result-review/${f.draft.resultId}/submit`)
      .send(action(1))
      .expect(403);
    await maker
      .post(`result-review/${f.draft.resultId}/submit`, { ...action(1), confirmed: false })
      .expect(400);
  });
  it('rejects changes to enrollment or examination context after draft entry', async () => {
    const f = await fixture();
    await testDb().studentRegistration.update({
      where: { id: f.student.registrationId },
      data: { status: 'SUSPENDED' },
    });
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(400);
    expect(await testDb().resultReviewEvent.count({ where: { resultId: f.draft.resultId } })).toBe(
      0,
    );
  });
  it('exposes an immutable submitted marks version to staff only', async () => {
    const f = await fixture();
    const input = action(1);
    await maker.post(`result-review/${f.draft.resultId}/submit`, input).expect(200);
    const version = reviewVersionSchema.parse(
      (
        await checker
          .get(`result-review/${f.draft.resultId}/versions/${input.requestId}`)
          .expect(200)
      ).body,
    );
    expect(version.subjects[0]?.marks.internalMarks).toBe('0');
    expect(version.subjects[0]?.marks.externalMarks).toBe('70');
    const other = await fixture();
    await checker
      .get(`result-review/${other.draft.resultId}/versions/${input.requestId}`)
      .expect(404);
  });

  for (const structure of ['SEMESTER_WISE', 'YEAR_WISE'] as const)
    it(`${structure}: submits complete zero marks, locks old edits and preserves snapshot`, async () => {
      const f = await fixture(structure);
      const input = action(f.draft.version);
      const submitted = reviewReceiptSchema.parse(
        (await maker.post(`result-review/${f.draft.resultId}/submit`, input).expect(200)).body,
      );
      expect(submitted.status).toBe('UNDER_REVIEW');
      expect(submitted.version).toBe(2);
      const detail = reviewedResultSchema.parse(
        (await checker.get(`result-review/${f.draft.resultId}`).expect(200)).body,
      );
      expect(detail.subjects[0]?.marks.internalMarks).toBe('0');
      expect(detail.history[0]?.actorUserId).toBe(maker.user.id);
      expect(detail.policy.publicationEnabled).toBe(false);
      await maker.post('draft-results', { ...f.body, expectedVersion: 2 }).expect(409);
      const event = await testDb().resultReviewEvent.findUniqueOrThrow({
        where: { id: input.requestId },
      });
      expect(event.resultVersion).toBe(2);
      expect(JSON.stringify(event.snapshot)).not.toContain(f.student.registrationNumber);
      const audit = await testDb().auditLog.findFirstOrThrow({
        where: { entityId: f.draft.resultId, action: 'RESULT_REVIEW_SUBMITTED' },
      });
      expect(audit.actorUserId).toBe(maker.user.id);
    });
  it('rejects missing components without any transition', async () => {
    const f = await fixture();
    await maker
      .post('draft-results', {
        ...f.body,
        expectedVersion: 1,
        marks: { ...f.body.marks, externalMarks: null },
      })
      .expect(201);
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(2)).expect(400);
    expect(await testDb().resultReviewEvent.count({ where: { resultId: f.draft.resultId } })).toBe(
      0,
    );
  });
  it('rejects incomplete examination subject sets', async () => {
    const f = await fixture('SEMESTER_WISE', true);
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(400);
    const detail = reviewedResultSchema.parse(
      (await checker.get(`result-review/${f.draft.resultId}`).expect(200)).body,
    );
    expect(detail.issues.some((i) => i.code === 'INCOMPLETE_SUBJECTS')).toBe(true);
  });
  it('idempotently replays an identical submission and rejects reused payload identifiers', async () => {
    const f = await fixture();
    const input = action(1);
    const a = reviewReceiptSchema.parse(
      (await maker.post(`result-review/${f.draft.resultId}/submit`, input).expect(200)).body,
    );
    const b = reviewReceiptSchema.parse(
      (await maker.post(`result-review/${f.draft.resultId}/submit`, input).expect(200)).body,
    );
    expect(b).toEqual(a);
    await maker
      .post(`result-review/${f.draft.resultId}/submit`, { ...input, reason: 'Different request' })
      .expect(409);
    expect(await testDb().resultReviewEvent.count({ where: { resultId: f.draft.resultId } })).toBe(
      1,
    );
  });
  it('permits only one concurrent submission', async () => {
    const f = await fixture();
    const responses = await Promise.all([
      maker.post(`result-review/${f.draft.resultId}/submit`, action(1)),
      maker.post(`result-review/${f.draft.resultId}/submit`, action(1)),
    ]);
    expect(
      responses.map((r) => r.status).sort(),
      logs.filter((l) => l.includes('Unhandled error')).join('\n'),
    ).toEqual([200, 409]);
  });
  it('rejects stale expected versions', async () => {
    const f = await fixture();
    await maker
      .post('draft-results', {
        ...f.body,
        expectedVersion: 1,
        marks: { ...f.body.marks, externalMarks: '60' },
      })
      .expect(201);
    await maker.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(409);
  });
  it('rolls back state, snapshot and audit together on failure; permits retry', async () => {
    const f = await fixture();
    const input = action(1);
    const spy = vi
      .spyOn(app.get(AuditService), 'writeAuditEvent')
      .mockRejectedValueOnce(new Error('Synthetic audit failure'));
    await maker.post(`result-review/${f.draft.resultId}/submit`, input).expect(500);
    expect(
      (await testDb().result.findUniqueOrThrow({ where: { id: f.draft.resultId } }))
        .publicationStatus,
    ).toBe('DRAFT');
    expect(await testDb().resultReviewEvent.count({ where: { resultId: f.draft.resultId } })).toBe(
      0,
    );
    spy.mockRestore();
    await maker.post(`result-review/${f.draft.resultId}/submit`, input).expect(200);
  });
  it('enforces read/write permissions and blocks publication even for publisher', async () => {
    const f = await fixture();
    await viewer.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(403);
    await publisher.post(`result-review/${f.draft.resultId}/submit`, action(1)).expect(403);
    await maker.post(`result-review/${f.draft.resultId}/approve`, action(1)).expect(403);
    await checker.post(`result-review/${f.draft.resultId}/publish`, action(1)).expect(409);
    await maker.post(`result-review/${f.draft.resultId}/publish`, action(1)).expect(403);
  });
  it('lists only the requested examination/status with bounded pagination and rejects unknown filters', async () => {
    const f = await fixture();
    const queue = reviewQueueSchema.parse(
      (
        await checker
          .get(`result-review?examinationId=${f.exam.id}&status=DRAFT&pageSize=1`)
          .expect(200)
      ).body,
    );
    expect(queue.items[0]?.id).toBe(f.draft.resultId);
    expect(queue.meta.total).toBe(1);
    await checker.get('result-review?untrusted=1').expect(400);
  });
  it('rejects direct snapshot alteration and under-review marks writes', async () => {
    const f = await fixture();
    const input = action(1);
    await maker.post(`result-review/${f.draft.resultId}/submit`, input).expect(200);
    await expect(
      testDb().resultReviewEvent.update({
        where: { id: input.requestId },
        data: { reason: 'tampered' },
      }),
    ).rejects.toThrow();
    await expect(
      testDb().resultItem.update({ where: { id: f.draft.id }, data: { externalMarks: 1 } }),
    ).rejects.toThrow();
    await expect(
      testDb().result.update({ where: { id: f.draft.resultId }, data: { totalMarks: 1 } }),
    ).rejects.toThrow();
  });
});
