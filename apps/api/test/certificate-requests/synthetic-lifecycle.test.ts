import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { academicCertificateSample } from '@docversity/documents';
import type { ObjectStorage } from '@docversity/storage';
import {
  certificateRequestSchema,
  syntheticCertificateReceiptSchema,
} from '@docversity/validation';
import { WorkflowPolicyService } from '../../src/release-workflows/workflow-policy.service.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { CertificatePoliciesService } from '../../src/certificate-requests/certificate-policies.service.js';
import { SyntheticCertificatesService } from '../../src/certificate-requests/synthetic-certificates.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import { activatedStudent, studentCsrf } from '../student-auth/support.js';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';

let app: INestApplication, maker: Staff, checker: Staff, viewer: Staff;
const registrations: string[] = [];
const command = () => ({ requestId: randomUUID(), confirmed: true as const });
beforeAll(async () => {
  app = await createTestApp(realConfig());
  maker = await staff(app, ['SUPER_ADMIN']);
  checker = await staff(app, ['APPROVER']);
  viewer = await staff(app, ['VIEWER']);
});
beforeEach(async () => {
  await app
    .get(RateLimiter)
    .clear('certificate-request-write', [
      `principal:${maker.user.id}`,
      `principal:${checker.user.id}`,
    ]);
  vi.spyOn(app.get(CertificatePoliciesService), 'definitions').mockReturnValue([
    {
      id: 'SAMPLE-LIFECYCLE',
      version: 1,
      certificateType: 'TRANSCRIPT',
      approved: true,
      authorityReference: 'SYNTHETIC ONLY',
      submissionEnabled: true,
      eligibilityRule: 'SYNTHETIC_TEST_ONLY',
      eligibilityReference: 'SYNTHETIC ONLY',
      fields: { purposeRequired: true, remarksAllowed: false },
      evidence: { requirement: 'NONE', authorityReference: 'SYNTHETIC ONLY' },
      fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'SYNTHETIC ONLY' },
      actions: ['SUBMIT', 'CANCEL'],
    },
  ]);
  vi.spyOn(app.get(CertificatePoliciesService), 'reviewDefinition').mockReturnValue({
    id: 'SAMPLE-REVIEW',
    approved: true,
    authorityReference: 'SYNTHETIC ONLY',
    certificateTypes: ['TRANSCRIPT'],
    action: 'COMPLETE_REVIEW',
  });
  vi.spyOn(app.get(SyntheticCertificatesService), 'policyDefinition').mockImplementation(() => ({
    contractVersion: 1,
    usage: 'SYNTHETIC_ONLY',
    signing: 'UNSIGNED_SAMPLE',
    registrationIds: registrations,
  }));
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

async function fixture() {
  const student = await activatedStudent(app, maker, 'SAMPLE-CREDENTIAL');
  registrations.push(student.registrationId);
  const csrf = await studentCsrf(student.agent);
  const response = await student.agent
    .post('/api/v1/student/certificate-requests')
    .set('X-CSRF-Token', csrf)
    .send({
      certificateType: 'TRANSCRIPT',
      submissionKey: randomUUID(),
      purpose: 'Synthetic lifecycle only',
    })
    .expect(201);
  const request = certificateRequestSchema.parse(response.body);
  await maker
    .post(`certificate-requests/${request.id}/record-review`, {
      version: 1,
      privateNote: 'Synthetic review',
    })
    .expect(200);
  await maker
    .post(`certificate-requests/${request.id}/complete-review`, { version: 2 })
    .expect(200);
  return { student, request, prepare: { ...command(), registrationId: student.registrationId } };
}
async function prepared() {
  const f = await fixture();
  const response = await maker
    .post(`certificate-requests/${f.request.id}/synthetic-credential`, f.prepare)
    .expect(200);
  return { ...f, receipt: syntheticCertificateReceiptSchema.parse(response.body) };
}
async function issued() {
  const f = await prepared();
  await checker
    .post(`synthetic-certificates/${f.receipt.certificateId}/approve`, command())
    .expect(200);
  const response = await checker
    .post(`synthetic-certificates/${f.receipt.certificateId}/issue`, command())
    .expect(200);
  return { ...f, receipt: syntheticCertificateReceiptSchema.parse(response.body) };
}
const rows = (id: string) =>
  testDb().auditLog.findMany({ where: { entityType: 'SyntheticCertificate', entityId: id } });

describe('request-backed unsigned synthetic credential lifecycle', () => {
  it('refuses client-supplied activation, signing, malformed identities and unconfirmed commands', async () => {
    const path = `certificate-requests/${randomUUID()}/synthetic-credential`;
    const body = { ...command(), registrationId: randomUUID() };
    for (const extra of [
      { signing: 'REAL' },
      { usage: 'OFFICIAL' },
      { registrationId: '../record' },
    ])
      await maker.post(path, { ...body, ...extra }).expect(400);
    await checker
      .post(`synthetic-certificates/${randomUUID()}/approve`, { ...command(), confirmed: false })
      .expect(400);
    await checker
      .post(`synthetic-certificates/${randomUUID()}/revoke`, { ...command(), reason: '\u0000' })
      .expect(400);
  });
  it('keeps the default unavailable without certificate or object access', async () => {
    vi.spyOn(app.get(SyntheticCertificatesService), 'policyDefinition').mockReturnValue(null);
    const create = vi.spyOn(app.get(PrismaService).client.certificate, 'create');
    const put = vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'putObject');
    await maker
      .post(`certificate-requests/${randomUUID()}/synthetic-credential`, {
        ...command(),
        registrationId: randomUUID(),
      })
      .expect(404);
    expect(create).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it('refuses production mode even if a complete synthetic policy is supplied', async () => {
    const registrationId = randomUUID();
    const service = new SyntheticCertificatesService(
      app.get(PrismaService),
      app.get(AuditService),
      { ...realConfig(), NODE_ENV: 'production' },
      app.get<ObjectStorage>(OBJECT_STORAGE),
    );
    vi.spyOn(service, 'policyDefinition').mockReturnValue({
      contractVersion: 1,
      usage: 'SYNTHETIC_ONLY',
      registrationIds: [registrationId],
      signing: 'UNSIGNED_SAMPLE',
    });
    await expect(
      service.prepare(randomUUID(), { ...command(), registrationId }, maker.user.id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('preserves staff/student separation, RBAC, CSRF and maker-checker controls', async () => {
    const f = await prepared();
    const path = `synthetic-certificates/${f.receipt.certificateId}/approve`;
    await browser(app)
      .post('/api/v1/' + path)
      .send(command())
      .expect(401);
    await f.student.agent
      .post('/api/v1/' + path)
      .send(command())
      .expect(401);
    await viewer.post(path, command()).expect(403);
    await maker.agent
      .post('/api/v1/' + path)
      .send(command())
      .expect(403);
    await maker.post(path, command()).expect(409);
    expect(
      (await testDb().certificate.findUniqueOrThrow({ where: { id: f.receipt.certificateId } }))
        .status,
    ).toBe('PENDING_APPROVAL');
  });
  it('binds preparation to the completed request and its owned allowlisted registration', async () => {
    const f = await fixture(),
      foreign = await fixture();
    await maker
      .post(`certificate-requests/${f.request.id}/synthetic-credential`, {
        ...f.prepare,
        registrationId: foreign.student.registrationId,
      })
      .expect(404);
    const first = await maker
      .post(`certificate-requests/${f.request.id}/synthetic-credential`, f.prepare)
      .expect(200);
    expect(
      (
        await maker
          .post(`certificate-requests/${f.request.id}/synthetic-credential`, f.prepare)
          .expect(200)
      ).body,
    ).toEqual(first.body);
    await maker
      .post(`certificate-requests/${f.request.id}/synthetic-credential`, {
        ...f.prepare,
        requestId: randomUUID(),
      })
      .expect(409);
    await maker
      .post(`certificate-requests/${foreign.request.id}/close`, { version: 3 })
      .expect(200);
    await maker
      .post(`certificate-requests/${foreign.request.id}/synthetic-credential`, foreign.prepare)
      .expect(409);
  });
  it('serializes concurrent approvals and refuses reuse with different content', async () => {
    const f = await prepared(),
      body = command(),
      path = `synthetic-certificates/${f.receipt.certificateId}/approve`;
    const responses = await Promise.all([checker.post(path, body), checker.post(path, body)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[0].body).toEqual(responses[1].body);
    await checker.post(path, { ...body, reason: 'Changed request' }).expect(409);
    expect((await rows(f.receipt.certificateId)).length).toBe(2);
  });
  it('allocates unique sample numbers under concurrent issue and serves pinned PDFs only to owners', async () => {
    const one = await prepared(),
      two = await prepared();
    await Promise.all(
      [one, two].map((f) =>
        checker
          .post(`synthetic-certificates/${f.receipt.certificateId}/approve`, command())
          .expect(200),
      ),
    );
    const responses = await Promise.all(
      [one, two].map((f) =>
        checker
          .post(`synthetic-certificates/${f.receipt.certificateId}/issue`, command())
          .expect(200),
      ),
    );
    const receipts = responses.map((r) => syntheticCertificateReceiptSchema.parse(r.body));
    expect(new Set(receipts.map((r) => r.certificateNumber)).size).toBe(2);
    for (const receipt of receipts)
      expect(receipt).toMatchObject({
        status: 'ISSUED',
        usage: 'SYNTHETIC_ONLY',
        unsigned: true,
        officialIssuanceAllowed: false,
      });
    const path = `/api/v1/student/synthetic-certificates/${one.receipt.certificateId}/preview`;
    const preview = await one.student.agent.get(path).expect(200);
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.headers['x-content-type-options']).toBe('nosniff');
    expect(preview.body).toEqual(academicCertificateSample('sample-transcript-v1', 'TRANSCRIPT'));
    await two.student.agent.get(path).expect(404);
    await maker.agent.get(path).expect(401);
    const reference = receipts[0]?.certificateNumber;
    if (!reference) throw new Error('Synthetic issue must allocate a sample number.');
    const reads = [
      vi.spyOn(app.get(PrismaService).client.certificate, 'findFirst'),
      vi.spyOn(app.get(PrismaService).client.certificate, 'findUnique'),
      vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'getObject'),
    ];
    for (const service of ['result', 'registration', 'certificate', 'admission-letter']) {
      const response = await browser(app)
        .post(`/api/v1/public/verify/${service}`)
        .send({ contractVersion: 1, reference })
        .expect(200);
      expect(response.body).toMatchObject({ status: 'UNAVAILABLE', service });
      expect(response.headers['cache-control']).toBe('no-store');
    }
    for (const read of reads) expect(read).not.toHaveBeenCalled();
    const log = JSON.stringify(await rows(one.receipt.certificateId));
    expect(log).not.toContain('verificationToken');
    expect(log).not.toContain('pdfStorageKey');
  });
  it('rolls back issuance/number allocation on audit failure, cleans only the attempted object and retries safely', async () => {
    const f = await prepared(),
      id = f.receipt.certificateId;
    await checker.post(`synthetic-certificates/${id}/approve`, command()).expect(200);
    const storage = app.get<ObjectStorage>(OBJECT_STORAGE);
    const put = vi.spyOn(storage, 'putObject'),
      remove = vi.spyOn(storage, 'deleteObject');
    const before = await testDb().numberSequence.findUnique({
      where: { key: 'synthetic-credentials-v1' },
    });
    vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
      new Error('Synthetic audit failure'),
    );
    const body = command();
    await checker.post(`synthetic-certificates/${id}/issue`, body).expect(500);
    expect((await testDb().certificate.findUniqueOrThrow({ where: { id } })).status).toBe(
      'APPROVED',
    );
    expect(
      await testDb().numberSequence.findUnique({ where: { key: 'synthetic-credentials-v1' } }),
    ).toEqual(before);
    expect(remove).toHaveBeenCalledWith(put.mock.calls[0]?.[0]);
    const response = await checker.post(`synthetic-certificates/${id}/issue`, body).expect(200);
    expect(
      (await checker.post(`synthetic-certificates/${id}/issue`, body).expect(200)).body,
    ).toEqual(response.body);
    expect(put).toHaveBeenCalledTimes(2);
  });
  it('preserves old PDFs through replacement, supersession and idempotent revocation', async () => {
    const f = await issued(),
      id = f.receipt.certificateId;
    const original = await testDb().certificate.findUniqueOrThrow({ where: { id } });
    const replacement = await maker
      .post(`certificate-requests/${f.request.id}/synthetic-credential`, {
        ...f.prepare,
        requestId: randomUUID(),
        replacesId: id,
      })
      .expect(200);
    const next = syntheticCertificateReceiptSchema.parse(replacement.body).certificateId;
    await checker.post(`synthetic-certificates/${next}/approve`, command()).expect(200);
    await checker.post(`synthetic-certificates/${next}/issue`, command()).expect(200);
    expect((await testDb().certificate.findUniqueOrThrow({ where: { id } })).status).toBe(
      'SUPERSEDED',
    );
    const body = { ...command(), reason: 'Synthetic revocation only' };
    const revoked = await checker.post(`synthetic-certificates/${next}/revoke`, body).expect(200);
    expect(
      (await checker.post(`synthetic-certificates/${next}/revoke`, body).expect(200)).body,
    ).toEqual(revoked.body);
    await f.student.agent.get(`/api/v1/student/synthetic-certificates/${next}/preview`).expect(404);
    expect(original.pdfStorageKey).not.toBeNull();
    if (!original.pdfStorageKey) throw new Error('Synthetic fixture must have a private PDF.');
    expect(
      Buffer.from(
        await app
          .get<ObjectStorage>(OBJECT_STORAGE)
          .getObject(original.pdfStorageKey, { maxBytes: 512_000 }),
      ),
    ).toEqual(academicCertificateSample('sample-transcript-v1', 'TRANSCRIPT'));
  });
  it('verifies only active unsigned synthetic credentials through the staff-only adapter', async () => {
    const f = await issued();
    vi.spyOn(app.get(WorkflowPolicyService), 'definition').mockReturnValue({
      contractVersion: 1,
      usage: 'SYNTHETIC_ONLY',
      fixtureReference: 'SYNTHETIC-CERTIFICATE',
      registrationIds: [f.student.registrationId],
      gatewaySecret: 'synthetic-only-adapter-secret-00000001',
    });
    const body = { service: 'certificate', reference: f.receipt.certificateNumber };
    const response = await maker.post('synthetic-workflows/verify', body).expect(200);
    expect(response.body).toMatchObject({
      status: 'SAMPLE_VALID',
      unsigned: true,
      officialVerificationAvailable: false,
    });
    await viewer.post('synthetic-workflows/verify', body).expect(403);
    await f.student.agent.post('/api/v1/synthetic-workflows/verify').send(body).expect(401);
    await checker
      .post(`synthetic-certificates/${f.receipt.certificateId}/revoke`, {
        ...command(),
        reason: 'Synthetic withdrawal',
      })
      .expect(200);
    expect((await maker.post('synthetic-workflows/verify', body).expect(200)).body).toMatchObject({
      status: 'SAMPLE_NOT_VALID',
    });
  });
  it('refuses changed request state and storage failure without issuing anything', async () => {
    const f = await prepared(),
      id = f.receipt.certificateId;
    await checker.post(`synthetic-certificates/${id}/approve`, command()).expect(200);
    vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'putObject').mockRejectedValueOnce(
      new Error('Synthetic storage failure'),
    );
    await checker.post(`synthetic-certificates/${id}/issue`, command()).expect(500);
    expect(
      (await testDb().certificate.findUniqueOrThrow({ where: { id } })).certificateNumber,
    ).toBeNull();
    await maker.post(`certificate-requests/${f.request.id}/close`, { version: 3 }).expect(200);
    await checker.post(`synthetic-certificates/${id}/issue`, command()).expect(409);
  });
});
