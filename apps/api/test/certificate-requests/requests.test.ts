import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  certificateRequestSchema,
  certificateRequestListSchema,
  certificateServiceListSchema,
  certificateApplicationPolicySchema,
} from '@docversity/validation';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent, studentCsrf } from '../student-auth/support.js';
import { CertificatePoliciesService } from '../../src/certificate-requests/certificate-policies.service.js';
import { CertificateRequestsService } from '../../src/certificate-requests/certificate-requests.service.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import type { ObjectStorage } from '@docversity/storage';
const fixture = certificateApplicationPolicySchema.parse({
  id: 'SYNTHETIC-TEST-POLICY',
  version: 1,
  certificateType: 'TRANSCRIPT',
  authorityReference: 'SYNTHETIC TEST ONLY',
  approved: true,
  submissionEnabled: true,
  eligibilityRule: 'SYNTHETIC_TEST_ONLY',
  eligibilityReference: 'Synthetic test student',
  fields: { purposeRequired: true, remarksAllowed: true },
  evidence: { requirement: 'NONE', authorityReference: 'Synthetic no-evidence test' },
  fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'Synthetic fee exemption' },
  actions: ['SUBMIT', 'RESPOND', 'CANCEL'],
});
let app: INestApplication, admin: Staff, reviewer: Staff, viewer: Staff;
let one: Awaited<ReturnType<typeof activatedStudent>>,
  two: Awaited<ReturnType<typeof activatedStudent>>;
beforeAll(async () => {
  app = await createTestApp(realConfig({ NODE_ENV: 'test' }));
  admin = await staff(app, ['SUPER_ADMIN']);
  reviewer = await staff(app, ['CERTIFICATE_ADMIN']);
  viewer = await staff(app, ['VIEWER']);
  one = await activatedStudent(app, admin, 'CERT-ONE');
  two = await activatedStudent(app, admin, 'CERT-TWO');
});
beforeEach(async () => {
  await app
    .get(RateLimiter)
    .clear('certificate-request-write', [
      `principal:${one.studentId}`,
      `principal:${two.studentId}`,
      `principal:${reviewer.user.id}`,
      `principal:${admin.user.id}`,
    ]);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());
function enable() {
  vi.spyOn(app.get(CertificatePoliciesService), 'definitions').mockReturnValue([fixture]);
}
async function post(student: typeof one, path: string, body: object) {
  const token = await studentCsrf(student.agent);
  return student.agent.post(`/api/v1/student/${path}`).set('X-CSRF-Token', token).send(body);
}
function body() {
  return {
    certificateType: 'TRANSCRIPT' as const,
    submissionKey: randomUUID(),
    purpose: 'Synthetic application',
    remarks: 'Synthetic student remark',
  };
}
async function create() {
  enable();
  const result = await post(one, 'certificate-requests', body());
  expect(result.status).toBe(201);
  return certificateRequestSchema.parse(result.body);
}
async function closeOpen() {
  const rows = await testDb().certificateRequest.findMany({
    where: { studentId: one.studentId, status: { notIn: ['CANCELLED', 'CLOSED'] } },
  });
  for (const r of rows) {
    if (r.status !== 'REVIEW_COMPLETED')
      await app
        .get(CertificateRequestsService)
        .transition(r.id, 'CANCEL', { version: r.version }, { studentId: one.studentId });
  }
}
it('requires authentication and dedicated permissions, with no-store on denial', async () => {
  const r = await browser(app).get('/api/v1/student/certificate-requests').expect(401);
  expect(r.headers['cache-control']).toBe('no-store');
  await viewer.get('certificate-requests').expect(403);
  await one.agent.get('/api/v1/certificate-requests').expect(401);
  for (const role of ['REGISTRAR', 'EXAM_ADMIN', 'APPROVER'] as const) {
    const user = await staff(app, [role]);
    await user.get('certificate-requests').expect(403);
  }
});
it('exposes exactly five unavailable services and blocks unconfigured or incomplete policies', async () => {
  const r = await one.agent.get('/api/v1/student/certificate-services').expect(200);
  const c = certificateServiceListSchema.parse(r.body);
  // Phase 12C added COURSE_COMPLETION as a contract value; it is unavailable like the others.
  expect(c.data.map((s) => s.certificateType)).toEqual([
    'TRANSCRIPT',
    'PROVISIONAL',
    'CHARACTER',
    'MIGRATION',
    'COURSE_COMPLETION',
  ]);
  expect(c.data.every((s) => !s.available)).toBe(true);
  expect(c.corrections.available).toBe(false);
  expect((await post(one, 'certificate-requests', body())).status).toBe(409);
  expect(
    (await post(one, 'certificate-requests', { ...body(), certificateType: 'COURSE_COMPLETION' }))
      .status,
  ).toBe(409);
  vi.spyOn(app.get(CertificatePoliciesService), 'definitions').mockReturnValue([
    { ...fixture, fee: undefined },
  ]);
  expect((await post(one, 'certificate-requests', body())).status).toBe(409);
});
it('never accepts a synthetic eligibility evaluator outside an isolated test configuration', () => {
  const policy = new CertificatePoliciesService(realConfig({ NODE_ENV: 'production' }));
  vi.spyOn(policy, 'definitions').mockReturnValue([fixture]);
  expect(policy.get('TRANSCRIPT')).toBeNull();
});
it('rejects forged identity, staff notes, payment, approval, issuance and training types', async () => {
  enable();
  for (const extra of [
    { studentId: two.studentId },
    { privateNote: 'forged' },
    { paymentStatus: 'PAID' },
    { status: 'ISSUED' },
    { certificateType: 'TRAINING_CERTIFICATE' },
    { certificateId: randomUUID() },
  ])
    expect((await post(one, 'certificate-requests', { ...body(), ...extra })).status).toBe(400);
  await one.agent.post('/api/v1/student/certificate-requests').send(body()).expect(403);
});
it('creates atomically and handles concurrent identical and different submissions safely', async () => {
  enable();
  const b = body();
  const results = await Promise.all([
    app.get(CertificateRequestsService).submit(one.studentId, b),
    app.get(CertificateRequestsService).submit(one.studentId, b),
  ]);
  expect(results[0].id).toBe(results[1].id);
  const id = results[0].id;
  expect(await testDb().certificateRequestEvent.count({ where: { requestId: id } })).toBe(1);
  expect(
    await testDb().auditLog.count({
      where: { entityId: id, action: 'CERTIFICATE_REQUEST_SUBMITTED' },
    }),
  ).toBe(1);
  expect(
    (await post(one, 'certificate-requests', { ...b, purpose: 'Different body' })).status,
  ).toBe(409);
  expect((await post(one, 'certificate-requests', body())).status).toBe(409);
  await closeOpen();
});
it('enforces ownership on list, detail, responses and cancellation', async () => {
  const r = await create();
  const list = await two.agent.get('/api/v1/student/certificate-requests').expect(200);
  expect(certificateRequestListSchema.parse(list.body).data).toEqual([]);
  await two.agent.get(`/api/v1/student/certificate-requests/${r.id}`).expect(404);
  expect(
    (
      await post(two, `certificate-requests/${r.id}/respond`, {
        version: r.version,
        message: 'Forged',
      })
    ).status,
  ).toBe(404);
  expect(
    (await post(two, `certificate-requests/${r.id}/cancel`, { version: r.version })).status,
  ).toBe(404);
  await closeOpen();
});
it('requests information, accepts a policy-authorized response and hides internal notes', async () => {
  const r = await create();
  const info = await reviewer
    .post(`certificate-requests/${r.id}/request-information`, {
      version: 1,
      message: 'Please clarify your purpose.',
      privateNote: 'PRIVATE STAFF ONLY',
    })
    .expect(200);
  expect(certificateRequestSchema.parse(info.body).status).toBe('INFORMATION_REQUESTED');
  const own = await one.agent.get(`/api/v1/student/certificate-requests/${r.id}`).expect(200);
  expect(JSON.stringify(own.body)).not.toMatch(/PRIVATE STAFF|privateNote|actorUserId|studentId/);
  expect(
    (
      await post(one, `certificate-requests/${r.id}/respond`, {
        version: 2,
        message: 'For further study.',
      })
    ).status,
  ).toBe(200);
  const review = await reviewer
    .post(`certificate-requests/${r.id}/record-review`, {
      version: 3,
      privateNote: 'REVIEW PRIVATE',
    })
    .expect(200);
  expect(certificateRequestSchema.parse(review.body).status).toBe('UNDER_REVIEW');
  const view = await one.agent.get(`/api/v1/student/certificate-requests/${r.id}`).expect(200);
  expect(certificateRequestSchema.parse(view.body).events).toHaveLength(3);
  expect(JSON.stringify(view.body)).not.toContain('REVIEW PRIVATE');
  await closeOpen();
});
it('rejects stale/skipped transitions and leaves exactly one winner under concurrency', async () => {
  const r = await create();
  expect(
    (await post(one, `certificate-requests/${r.id}/respond`, { version: 1, message: 'Skipped' }))
      .status,
  ).toBe(409);
  const service = app.get(CertificateRequestsService);
  const results = await Promise.allSettled([
    service.transition(
      r.id,
      'REQUEST_INFORMATION',
      { version: 1, message: 'One' },
      { userId: reviewer.user.id },
    ),
    service.transition(
      r.id,
      'REQUEST_INFORMATION',
      { version: 1, message: 'Two' },
      { userId: reviewer.user.id },
    ),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const row = await testDb().certificateRequest.findUniqueOrThrow({ where: { id: r.id } });
  expect(row.version).toBe(2);
  expect(await testDb().certificateRequestEvent.count({ where: { requestId: r.id } })).toBe(2);
  await closeOpen();
});
it('rolls back creation and transitions when audit writing fails', async () => {
  enable();
  const count = await testDb().certificateRequest.count();
  vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
    new Error('Synthetic audit failure'),
  );
  expect((await post(one, 'certificate-requests', body())).status).toBe(500);
  expect(await testDb().certificateRequest.count()).toBe(count);
  const r = certificateRequestSchema.parse((await post(one, 'certificate-requests', body())).body);
  vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
    new Error('Synthetic audit failure'),
  );
  await reviewer
    .post(`certificate-requests/${r.id}/request-information`, { version: 1, message: 'Clarify' })
    .expect(500);
  expect(
    (await testDb().certificateRequest.findUniqueOrThrow({ where: { id: r.id } })).version,
  ).toBe(1);
  expect(await testDb().certificateRequestEvent.count({ where: { requestId: r.id } })).toBe(1);
  vi.restoreAllMocks();
  enable();
  await closeOpen();
});
it('retains history and immutable snapshots with database guards', async () => {
  const r = await create();
  const e = await testDb().certificateRequestEvent.findFirstOrThrow({ where: { requestId: r.id } });
  await expect(
    testDb().certificateRequestEvent.update({
      where: { id: e.id },
      data: { studentMessage: 'Rewritten' },
    }),
  ).rejects.toThrow();
  await expect(testDb().certificateRequestEvent.delete({ where: { id: e.id } })).rejects.toThrow();
  await expect(
    testDb().certificateRequest.update({
      where: { id: r.id },
      data: { purpose: 'Rewritten', version: 2 },
    }),
  ).rejects.toThrow();
  await expect(
    testDb().certificateRequest.update({
      where: { id: r.id },
      data: { status: 'ISSUED', version: 2 },
    }),
  ).rejects.toThrow();
  await expect(
    testDb().certificateRequest.update({
      where: { id: r.id },
      data: { status: 'UNDER_REVIEW', version: 2 },
    }),
  ).rejects.toThrow();
  await closeOpen();
});
it('keeps review completion disabled even for super admins; payment and issuance have no routes', async () => {
  const r = await create();
  await admin.post(`certificate-requests/${r.id}/complete-review`, { version: 1 }).expect(409);
  for (const action of ['approve', 'issue', 'verify-payment'])
    await admin.post(`certificate-requests/${r.id}/${action}`, { version: 1 }).expect(404);
  expect(
    (await testDb().certificateRequest.findUniqueOrThrow({ where: { id: r.id } })).status,
  ).toBe('SUBMITTED');
  await closeOpen();
});
it('a separately authorized review can complete in an isolated fixture without issuing a document', async () => {
  const r = await create();
  await reviewer
    .post(`certificate-requests/${r.id}/record-review`, {
      version: 1,
      privateNote: 'Checked synthetic application',
    })
    .expect(200);
  vi.spyOn(app.get(CertificatePoliciesService), 'reviewDefinition').mockReturnValue({
    id: 'SYNTHETIC-REVIEW',
    approved: true,
    authorityReference: 'SYNTHETIC REVIEW ONLY',
    certificateTypes: ['TRANSCRIPT'],
    action: 'COMPLETE_REVIEW',
  });
  const finished = await reviewer
    .post(`certificate-requests/${r.id}/complete-review`, { version: 2 })
    .expect(200);
  expect(certificateRequestSchema.parse(finished.body).status).toBe('REVIEW_COMPLETED');
  expect(certificateRequestSchema.parse(finished.body).issuanceStatus).toBe('NOT_AVAILABLE');
  await reviewer.post(`certificate-requests/${r.id}/close`, { version: 3 }).expect(200);
  await reviewer
    .post(`certificate-requests/${r.id}/request-information`, { version: 4, message: 'Reopen' })
    .expect(409);
});
it('rejects disabled follow-up policies and never writes certificates or MinIO objects', async () => {
  const r = await create();
  await reviewer
    .post(`certificate-requests/${r.id}/request-information`, { version: 1, message: 'Clarify' })
    .expect(200);
  vi.restoreAllMocks();
  const storage = vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'putObject');
  const before = await testDb().certificate.count();
  expect(
    (await post(one, `certificate-requests/${r.id}/respond`, { version: 2, message: 'Response' }))
      .status,
  ).toBe(409);
  expect(storage).not.toHaveBeenCalled();
  expect(await testDb().certificate.count()).toBe(before);
  enable();
  await closeOpen();
});
it('enforces required fields, bounded pagination and rate limits', async () => {
  enable();
  expect((await post(one, 'certificate-requests', { ...body(), purpose: '' })).status).toBe(400);
  await reviewer.get('certificate-requests?pageSize=1000').expect(400);
  await reviewer.get('certificate-requests?storageKey=private').expect(400);
  const service = app.get(CertificateRequestsService);
  const id = randomUUID();
  for (let n = 0; n < 30; n++) await service.throttle(id);
  await expect(service.throttle(id)).rejects.toMatchObject({ status: 429 });
});

it('database event constraints reject a false transition or missing public message atomically', async () => {
  const r = await create();
  for (const event of [
    { action: 'COMPLETE_REVIEW', studentMessage: 'Wrong event' },
    { action: 'REQUEST_INFORMATION', studentMessage: null },
  ]) {
    await expect(
      testDb().$transaction(async (tx) => {
        await tx.certificateRequest.update({
          where: { id: r.id },
          data: { status: 'INFORMATION_REQUESTED', version: 2 },
        });
        await tx.certificateRequestEvent.create({
          data: {
            requestId: r.id,
            version: 2,
            status: 'INFORMATION_REQUESTED',
            actorUserId: reviewer.user.id,
            ...event,
          },
        });
      }),
    ).rejects.toThrow();
    expect(
      (await testDb().certificateRequest.findUniqueOrThrow({ where: { id: r.id } })).version,
    ).toBe(1);
  }
  await closeOpen();
});
