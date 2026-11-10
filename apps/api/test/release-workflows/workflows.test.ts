import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { INestApplication } from '@nestjs/common';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { savedDraftSchema, studentResultsPageSchema } from '@docversity/validation';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activate, issueCode, studentCsrf } from '../student-auth/support.js';
import { resultsFixture, contextFor } from '../result-imports/support.js';
import {
  ResultReviewService,
  RESULT_REVIEW_POLICY,
} from '../../src/results/result-review.service.js';
import { WorkflowPolicyService } from '../../src/release-workflows/workflow-policy.service.js';
import { AuditService } from '../../src/audit/audit.service.js';
let app: INestApplication, maker: Staff, checker: Staff, examiner: Staff, viewer: Staff;
const ids: string[] = [];
const fixturePolicy = () => ({
  contractVersion: 1,
  usage: 'SYNTHETIC_ONLY',
  fixtureReference: 'SYNTHETIC-RELEASE-TEST',
  registrationIds: ids,
  gatewaySecret: 'synthetic-only-durable-gateway-secret-0001',
});
const grading = () => ({
  contractVersion: 1,
  usage: 'SYNTHETIC_ONLY',
  policyId: 'SAMPLE',
  version: 1,
  aggregation: 'SUM_COMPONENTS',
  attemptSelection: 'EXPLICIT',
  absentHandling: 'WITHHOLD',
  earnedCreditRule: 'PASS_ONLY',
  failureOutcome: 'BACKLOG',
  gpaDenominator: 'ATTEMPTED_CREDITS',
  gpaRounding: 'HALF_UP',
  componentFailureGrade: 'F',
  componentMinimumPercentBps: {},
  bands: [
    { minimumPercentBps: 8000, grade: 'A', gradePoint: '9', passing: true },
    { minimumPercentBps: 4000, grade: 'B', gradePoint: '6', passing: true },
    { minimumPercentBps: 0, grade: 'F', gradePoint: '0', passing: false },
  ],
});
beforeAll(async () => {
  app = await createTestApp(realConfig());
  [maker, checker, examiner, viewer] = await Promise.all([
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['VIEWER']),
  ]);
});
beforeEach(() => {
  vi.spyOn(app.get(WorkflowPolicyService), 'definition').mockImplementation(fixturePolicy);
  vi.spyOn(app.get(ResultReviewService), 'gradingPolicyDefinition').mockImplementation(grading);
  vi.spyOn(app.get(ResultReviewService), 'policy').mockReturnValue({
    ...RESULT_REVIEW_POLICY,
    approvalEnabled: true,
    approvalBlockers: [],
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());
const command = (version: number, message?: string) => ({
  requestId: randomUUID(),
  version,
  confirmed: true,
  ...(message ? { message } : {}),
});
async function fixture(approve = true) {
  const f = await resultsFixture(maker, examiner, {
    subjects: [
      {
        period: 1,
        maxMarks: 100,
        credits: 3,
        components: [
          { name: 'Internal', maxMarks: 30 },
          { name: 'External', maxMarks: 70 },
        ],
      },
    ],
  });
  const exam = await f.examination();
  const student = await f.student();
  ids.push(student.registrationId);
  const subject = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: f.curriculum.id },
  });
  const draft = savedDraftSchema.parse(
    (
      await examiner
        .post('draft-results', {
          context: { ...contextFor(f, exam), periodNumber: exam.period.number },
          registrationId: student.registrationId,
          programSubjectId: subject.id,
          reExamApplicationId: null,
          expectedVersion: null,
          marks: {
            internalMarks: '20',
            externalMarks: '60',
            practicalMarks: null,
            otherMarks: null,
            totalMarks: null,
          },
        })
        .expect(201)
    ).body,
  );
  if (approve) {
    await examiner
      .post(`result-review/${draft.resultId}/submit`, {
        requestId: randomUUID(),
        expectedVersion: 1,
        confirmed: true,
      })
      .expect(200);
    await checker
      .post(`result-review/${draft.resultId}/approve`, {
        requestId: randomUUID(),
        expectedVersion: 2,
        confirmed: true,
      })
      .expect(200);
  }
  const agent = browser(app);
  const code = await issueCode(maker, student.registrationId);
  expect(
    (
      await activate(agent, {
        registrationNumber: student.registrationNumber,
        activationCode: code,
      })
    ).status,
  ).toBe(200);
  return { f, student, draft, agent };
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>, kind = 'RESULT') {
  const body = {
    requestId: randomUUID(),
    kind,
    registrationId: f.student.registrationId,
    ...(kind === 'RESULT' ? { resultId: f.draft.resultId } : {}),
    confirmed: true,
  };
  const response = await maker.post('synthetic-workflows/releases', body).expect(200);
  return { body, id: z.object({ id: z.uuid() }).parse(response.body).id };
}
async function publish(f: Awaited<ReturnType<typeof fixture>>, kind = 'RESULT') {
  const r = await prepare(f, kind);
  await checker.post(`synthetic-workflows/releases/${r.id}/APPROVE`, command(1)).expect(200);
  await checker.post(`synthetic-workflows/releases/${r.id}/PUBLISH`, command(2)).expect(200);
  return r;
}
async function studentPost(agent: ReturnType<typeof browser>, path: string, body: object) {
  const csrf = await studentCsrf(agent);
  return agent
    .post('/api/v1/student/' + path)
    .set('X-CSRF-Token', csrf)
    .send(body);
}
describe('synthetic release success paths without official activation', () => {
  it('is unavailable by default and enforces staff permissions and strict identifiers', async () => {
    vi.spyOn(app.get(WorkflowPolicyService), 'definition').mockReturnValue(null);
    const body = {
      requestId: randomUUID(),
      kind: 'REGISTRATION',
      registrationId: randomUUID(),
      confirmed: true,
    };
    await maker.post('synthetic-workflows/releases', body).expect(404);
    await viewer.post('synthetic-workflows/releases', body).expect(403);
    await browser(app).post('/api/v1/synthetic-workflows/releases').send(body).expect(401);
    await maker.post('synthetic-workflows/releases', { ...body, official: true }).expect(400);
  });
  it('publishes only approved synthetic provenance, keeps drafts private and rejects foreign registration reads', async () => {
    const f = await fixture(),
      other = await fixture(false);
    const r = await prepare(f);
    expect(
      studentResultsPageSchema.parse(
        (await f.agent.get('/api/v1/student/results').expect(200)).body,
      ).data,
    ).toEqual([]);
    await maker.post(`synthetic-workflows/releases/${r.id}/APPROVE`, command(1)).expect(409);
    await checker.post(`synthetic-workflows/releases/${r.id}/PUBLISH`, command(1)).expect(409);
    await checker.post(`synthetic-workflows/releases/${r.id}/APPROVE`, command(1)).expect(200);
    await checker.post(`synthetic-workflows/releases/${r.id}/PUBLISH`, command(2)).expect(200);
    const page = studentResultsPageSchema.parse(
      (await f.agent.get('/api/v1/student/results').expect(200)).body,
    );
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      id: r.id,
      resultId: f.draft.resultId,
      sgpa: '9.000',
      usage: 'SYNTHETIC_ONLY',
    });
    expect(page.publicationAvailable).toBe(false);
    await f.agent.get(`/api/v1/student/results/${r.id}`).expect(200);
    await other.agent.get(`/api/v1/student/results/${r.id}`).expect(404);
    await maker.agent.get(`/api/v1/student/results/${r.id}`).expect(401);
    await prepareDenied(other);
    const original = await testDb().result.findUniqueOrThrow({ where: { id: f.draft.resultId } });
    expect(original.publicationStatus).toBe('APPROVED');
    expect(original.publishedAt).toBeNull();
    await checker
      .post(`synthetic-workflows/releases/${r.id}/WITHDRAW`, command(3, 'Synthetic withdrawal'))
      .expect(200);
    await f.agent.get(`/api/v1/student/results/${r.id}`).expect(404);
  });
  it('replays identical preparation, rolls back audits and forbids snapshot edits in SQL', async () => {
    const f = await fixture();
    const body = {
      requestId: randomUUID(),
      kind: 'RESULT',
      registrationId: f.student.registrationId,
      resultId: f.draft.resultId,
      confirmed: true,
    };
    vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
      new Error('Synthetic audit failure'),
    );
    await maker.post('synthetic-workflows/releases', body).expect(500);
    expect(
      await testDb().syntheticRelease.findUnique({ where: { id: body.requestId } }),
    ).toBeNull();
    await maker.post('synthetic-workflows/releases', body).expect(200);
    await maker.post('synthetic-workflows/releases', body).expect(200);
    await expect(
      testDb().syntheticRelease.update({
        where: { id: body.requestId },
        data: { snapshot: { usage: 'OFFICIAL' } },
      }),
    ).rejects.toThrow();
  });
  it('binds registration/admission adapters to published receipts and returns no personal public fields', async () => {
    const f = await fixture(false),
      foreign = await fixture(false);
    for (const kind of ['REGISTRATION', 'ADMISSION_LETTER']) {
      const r = await publish(f, kind);
      const service = kind === 'REGISTRATION' ? 'registration' : 'admission-letter';
      const valid = await maker
        .post('synthetic-workflows/verify', { service, reference: r.id })
        .expect(200);
      expect(valid.body).toMatchObject({
        status: 'SAMPLE_VALID',
        officialVerificationAvailable: false,
      });
      expect(JSON.stringify(valid.body)).not.toContain(f.student.registrationNumber);
      if (kind === 'ADMISSION_LETTER') {
        await f.agent.get(`/api/v1/student/admission-letters/${r.id}`).expect(200);
        await foreign.agent.get(`/api/v1/student/admission-letters/${r.id}`).expect(404);
      }
      await checker
        .post(`synthetic-workflows/releases/${r.id}/WITHDRAW`, command(3, 'Synthetic withdrawal'))
        .expect(200);
      expect(
        z
          .object({ status: z.string() })
          .parse(
            (
              await maker
                .post('synthetic-workflows/verify', { service, reference: r.id })
                .expect(200)
            ).body,
          ).status,
      ).toBe('SAMPLE_NOT_VALID');
    }
    for (const service of ['result', 'registration', 'certificate', 'admission-letter'])
      expect(
        z.object({ status: z.string() }).parse(
          (
            await browser(app)
              .post('/api/v1/public/verify/' + service)
              .send({ contractVersion: 1, reference: 'SYN-NOT-REAL' })
              .expect(200)
          ).body,
        ).status,
      ).toBe('UNAVAILABLE');
  });
  it('supports owned retotaling information/cancellation/closure without changing grades or asserting fees', async () => {
    const f = await fixture(),
      foreign = await fixture(false);
    const r = await publish(f);
    const body = {
      releaseId: r.id,
      submissionKey: randomUUID(),
      reason: 'Synthetic clerical check',
    };
    expect((await studentPost(foreign.agent, 'retotaling', body)).status).toBe(404);
    const response = await studentPost(f.agent, 'retotaling', body);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ feeStatus: 'NOT_CONFIGURED', academicDecision: 'NONE' });
    const id = z.object({ id: z.uuid() }).parse(response.body).id;
    expect(
      z.object({ id: z.uuid() }).parse((await studentPost(f.agent, 'retotaling', body)).body).id,
    ).toBe(id);
    await maker
      .post(
        `synthetic-workflows/retotaling/${id}/REQUEST_INFORMATION`,
        command(1, 'Synthetic clarification'),
      )
      .expect(200);
    expect(
      (await studentPost(f.agent, `retotaling/${id}/RESPOND`, command(2, 'Synthetic response')))
        .status,
    ).toBe(200);
    await maker
      .post(
        `synthetic-workflows/retotaling/${id}/CLOSE`,
        command(3, 'Clerical case closed; no academic decision'),
      )
      .expect(200);
    expect(
      (await testDb().result.findUniqueOrThrow({ where: { id: f.draft.resultId } })).outcome,
    ).toBeNull();
    expect((await foreign.agent.get('/api/v1/student/retotaling').expect(200)).body).toEqual([]);
  });
  it('serializes duplicate retotaling submissions and rolls back failed cancellation audits', async () => {
    const f = await fixture(),
      foreign = await fixture(false);
    const r = await publish(f);
    const body = {
      releaseId: r.id,
      submissionKey: randomUUID(),
      reason: 'Synthetic clerical review',
    };
    const csrf = await studentCsrf(f.agent);
    const submit = () =>
      f.agent.post('/api/v1/student/retotaling').set('X-CSRF-Token', csrf).send(body);
    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[0].body).toEqual(responses[1].body);
    const id = z.object({ id: z.uuid() }).parse(responses[0].body).id;
    expect(
      (await studentPost(f.agent, 'retotaling', { ...body, reason: 'Changed content' })).status,
    ).toBe(409);
    const cancel = command(1);
    expect((await studentPost(foreign.agent, `retotaling/${id}/CANCEL`, cancel)).status).toBe(404);
    vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
      new Error('Synthetic audit failure'),
    );
    expect((await studentPost(f.agent, `retotaling/${id}/CANCEL`, cancel)).status).toBe(500);
    expect((await testDb().retotalingRequest.findUniqueOrThrow({ where: { id } })).status).toBe(
      'SUBMITTED',
    );
    expect((await studentPost(f.agent, `retotaling/${id}/CANCEL`, cancel)).status).toBe(200);
    expect((await studentPost(f.agent, `retotaling/${id}/CANCEL`, cancel)).status).toBe(200);
    expect(await testDb().retotalingEvent.count({ where: { requestId: id } })).toBe(2);
  });
  it('persists migration plans, refuses changed retries and recovers without importing a record', async () => {
    const body = {
      id: randomUUID(),
      usage: 'SYNTHETIC_ONLY',
      sourceSystem: 'SYNTHETIC_ARCHIVE',
      records: [
        {
          sourceId: 'SYN-ONE',
          entity: 'SUBJECT',
          naturalKey: 'SYN-SUBJECT',
          references: [],
          values: { code: 'SYN-101', name: 'Synthetic subject' },
        },
      ],
    };
    const before = await testDb().student.count();
    const r = await maker.post('synthetic-workflows/migration/dry-run', body).expect(200);
    await maker.post('synthetic-workflows/migration/dry-run', body).expect(200);
    await maker.post('synthetic-workflows/migration/dry-run', { ...body, records: [] }).expect(409);
    const recovery = {
      requestId: randomUUID(),
      planDigest: z.object({ planDigest: z.string() }).parse(r.body).planDigest,
      expectedCheckpoint: 0,
    };
    const path = `synthetic-workflows/migration/${body.id}/recover`;
    await checker.post(path, recovery).expect(404);
    vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
      new Error('Synthetic audit failure'),
    );
    await maker.post(path, recovery).expect(500);
    expect(
      (await testDb().legacyMigrationBatch.findUniqueOrThrow({ where: { id: body.id } }))
        .checkpoint,
    ).toBe(0);
    const recovered = await maker.post(path, recovery).expect(200);
    expect((await maker.post(path, recovery).expect(200)).body).toEqual(recovered.body);
    await maker.post(path, { ...recovery, requestId: randomUUID() }).expect(409);
    expect(recovered.body).toMatchObject({ checkpoint: 1, state: 'RECONCILED' });
    expect(await testDb().student.count()).toBe(before);
  });
});
async function prepareDenied(f: Awaited<ReturnType<typeof fixture>>) {
  await maker
    .post('synthetic-workflows/releases', {
      requestId: randomUUID(),
      kind: 'RESULT',
      registrationId: f.student.registrationId,
      resultId: f.draft.resultId,
      confirmed: true,
    })
    .expect(409);
}
