import type { ObjectStorage } from '@docversity/storage';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest';
import {
  officialDocumentReceiptSchema,
  officialVerificationResponseSchema,
  certificateRequestSchema,
  savedDraftSchema,
  studentResultsPageSchema,
} from '@docversity/validation';
import {
  browser,
  createTestApp,
  http,
  realConfig,
  staff,
  testDb,
  uniqueCode,
  type Staff,
} from '../helpers.js';
import { activatedStudent, activate, issueCode, studentCsrf } from '../student-auth/support.js';
import { staticPdf } from '../historical-documents/support.js';
import { resultsFixture, contextFor } from '../result-imports/support.js';
import { CertificatePoliciesService } from '../../src/certificate-requests/certificate-policies.service.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { IdentifierHasher } from '../../src/auth/identifier-hasher.js';
import { AuditService } from '../../src/audit/audit.service.js';
let app: INestApplication, admin: Staff, second: Staff, maker: Staff, approver: Staff;
beforeAll(async () => {
  app = await createTestApp(realConfig({ NODE_ENV: 'test' }));
  admin = await staff(app, ['SUPER_ADMIN']);
  second = await staff(app, ['SUPER_ADMIN']);
  maker = await staff(app, ['CERTIFICATE_ADMIN']);
  approver = await staff(app, ['APPROVER']);
});
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const hash = app.get(IdentifierHasher);
  await app
    .get(RateLimiter)
    .clear('public-verification-v1', [
      'global',
      hash.hash('public-verification:client', '::ffff:127.0.0.1'),
      hash.hash('public-verification:client', '127.0.0.1'),
    ]);
});
const definition = {
  usage: 'SYNTHETIC_ONLY',
  institutionName: 'Synthetic Test University',
  authorizationReference: 'SYNTHETIC DESIGN POLICY ONLY',
  discloseProgram: true,
  discloseIssueDate: true,
  identityFactor: 'AUTHENTICATED_OWNER',
  resultMode: 'REVIEWED_VALUES_ONLY',
};
async function policy(programId: string, service: string) {
  const p = (
    await admin.post('verification-policies', { service, programId, definition }).expect(201)
  ).body as { id: string };
  await second.post(`verification-policies/${p.id}/approve`).expect(200);
  return p.id;
}
async function check(
  service: string,
  body: object,
  student?: Awaited<ReturnType<typeof activatedStudent>>,
) {
  const req = student ? student.agent : http(app);
  const csrf = student ? await studentCsrf(student.agent) : '';
  const r = await req
    .post(`/api/v1/public/verify/${service}`)
    .set('X-CSRF-Token', csrf)
    .send({ contractVersion: 2, ...body });
  const parsed = officialVerificationResponseSchema.safeParse(r.body);
  return {
    status: r.status,
    headers: r.headers,
    body: parsed.success ? parsed.data : { status: undefined, results: undefined },
  };
}
async function prepare(type: 'ADMISSION_LETTER' | 'TRANSCRIPT' = 'ADMISSION_LETTER') {
  const student = await activatedStudent(app, admin, '0000-VERIFY');
  const r = await testDb().studentRegistration.findUniqueOrThrow({
    where: { id: student.registrationId },
  });
  const policyId = await policy(
    r.programId,
    type === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate',
  );
  const template = (
    await maker
      .post('official-documents/templates', {
        policyId,
        programId: r.programId,
        documentType: type,
        name: uniqueCode('TEST-TEMPLATE'),
      })
      .expect(201)
  ).body as { id: string };
  await approver.post(`official-documents/templates/${template.id}/approve`).expect(200);
  let requestId: string | undefined;
  if (type === 'TRANSCRIPT') {
    vi.spyOn(app.get(CertificatePoliciesService), 'definitions').mockReturnValue([
      {
        id: 'TEST-REQUEST-POLICY',
        version: 1,
        certificateType: 'TRANSCRIPT',
        approved: true,
        authorityReference: 'SYNTHETIC',
        submissionEnabled: true,
        eligibilityRule: 'SYNTHETIC_TEST_ONLY',
        eligibilityReference: 'SYNTHETIC',
        fields: { purposeRequired: true, remarksAllowed: false },
        evidence: { requirement: 'NONE', authorityReference: 'SYNTHETIC' },
        fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'SYNTHETIC' },
        actions: ['SUBMIT', 'CANCEL'],
      },
    ]);
    vi.spyOn(app.get(CertificatePoliciesService), 'reviewDefinition').mockReturnValue({
      id: 'TEST-REVIEW',
      approved: true,
      authorityReference: 'SYNTHETIC',
      certificateTypes: ['TRANSCRIPT'],
      action: 'COMPLETE_REVIEW',
    });
    const csrf = await studentCsrf(student.agent);
    const request = certificateRequestSchema.parse(
      (
        await student.agent
          .post('/api/v1/student/certificate-requests')
          .set('X-CSRF-Token', csrf)
          .send({
            certificateType: 'TRANSCRIPT',
            purpose: 'Synthetic test',
            submissionKey: randomUUID(),
          })
          .expect(201)
      ).body,
    );
    await maker
      .post(`certificate-requests/${request.id}/record-review`, {
        version: 1,
        privateNote: 'Synthetic test review',
      })
      .expect(200);
    await maker
      .post(`certificate-requests/${request.id}/complete-review`, { version: 2 })
      .expect(200);
    requestId = request.id;
  }
  const number = `TEST-${randomUUID().slice(0, 12)}`;
  const metadata = {
    registrationId: r.id,
    policyId,
    templateId: template.id,
    documentType: type,
    certificateNumber: number,
    issueDate: '2026-11-01',
    authorityReference: 'Synthetic issued-record fixture only',
    ...(requestId ? { requestId } : {}),
  };
  const pdf = staticPdf();
  const response = await maker.agent
    .post('/api/v1/official-documents')
    .set('X-CSRF-Token', maker.csrf)
    .field('metadata', JSON.stringify(metadata))
    .attach('file', pdf, { filename: 'test.pdf', contentType: 'application/pdf' })
    .expect(201);
  return {
    student,
    policyId,
    metadata,
    pdf,
    receipt: officialDocumentReceiptSchema.parse(response.body),
  };
}
it('keeps real disclosure and synthetic policies disabled under production configuration', async () => {
  const production = await createTestApp(
    realConfig({
      NODE_ENV: 'production',
      COOKIE_SECURE: true,
      SESSION_SECRET: 'synthetic-production-session-secret-never-used-live-2026',
    }),
  );
  try {
    for (const service of ['admission-letter', 'certificate', 'registration', 'result']) {
      const r = await http(production)
        .post(`/api/v1/public/verify/${service}`)
        .send({ contractVersion: 2, reference: '00000001' })
        .expect(200);
      expect(officialVerificationResponseSchema.parse(r.body).status).toBe('UNAVAILABLE');
      expect(r.headers['cache-control']).toBe('no-store');
    }
  } finally {
    await production.close();
  }
});
it('requires separate policy approval, role authority and explicit production activation', async () => {
  const student = await activatedStudent(app, admin);
  const r = await testDb().studentRegistration.findUniqueOrThrow({
    where: { id: student.registrationId },
  });
  const p = (
    await admin
      .post('verification-policies', {
        service: 'registration',
        programId: r.programId,
        definition,
      })
      .expect(201)
  ).body as { id: string };
  await admin.post(`verification-policies/${p.id}/approve`).expect(403);
  await maker.post(`verification-policies/${p.id}/approve`).expect(403);
  await second.post(`verification-policies/${p.id}/approve`).expect(200);
  await expect(
    testDb().verificationPolicy.update({
      where: { id: p.id },
      data: { definition: { ...definition, discloseProgram: false } },
    }),
  ).rejects.toThrow();
  const official = (
    await admin
      .post('verification-policies', {
        service: 'registration',
        programId: r.programId,
        definition: { ...definition, usage: 'OFFICIAL' },
      })
      .expect(201)
  ).body as { id: string };
  await second.post(`verification-policies/${official.id}/approve`).expect(403);
});
it.each(['ADMISSION_LETTER', 'TRANSCRIPT'] as const)(
  '%s uses approved issuance, opaque QR, revocation and private owner downloads',
  async (type) => {
    const f = await prepare(type),
      service = type === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate';
    expect((await check(service, { reference: f.metadata.certificateNumber })).body.status).toBe(
      'NOT_FOUND',
    );
    await maker.post(`official-documents/${f.receipt.id}/approve`).expect(403);
    await approver.post(`official-documents/${f.receipt.id}/issue`).expect(409);
    await approver.post(`official-documents/${f.receipt.id}/approve`).expect(200);
    await approver.post(`official-documents/${f.receipt.id}/issue`).expect(200);
    const row = await testDb().certificate.findUniqueOrThrow({ where: { id: f.receipt.id } });
    expect(row.verificationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const valid = await check(service, { reference: f.metadata.certificateNumber });
    expect(valid.status).toBe(200);
    expect(valid.body.status).toBe(type === 'TRANSCRIPT' ? 'ISSUED' : 'VALID');
    expect(JSON.stringify(valid.body)).not.toMatch(
      /studentId|storage|fullName|dateOfBirth|authorityReference|pdfHash/,
    );
    expect(JSON.stringify(valid.body)).not.toContain(f.metadata.certificateNumber);
    expect((await check(service, { token: row.verificationToken })).body).toEqual(valid.body);
    expect(
      (await check(service, { token: randomBytes(32).toString('base64url') })).body.status,
    ).toBe('NOT_FOUND');
    const route = `/api/v1/student/official-documents/${row.id}/download`;
    await http(app).get(route).expect(401);
    await admin.agent.get(route).expect(401);
    const other = await activatedStudent(app, admin, 'OTHER');
    await other.agent.get(route).expect(404);
    const download = await f.student.agent.get(route).expect(200);
    expect(download.headers['cache-control']).toBe('no-store');
    await approver
      .post(`official-documents/${row.id}/revoke`, { reason: 'Synthetic revocation' })
      .expect(200);
    expect((await check(service, { token: row.verificationToken })).body.status).toBe('REVOKED');
    await f.student.agent.get(route).expect(404);
  },
);
it('withdraws disclosure authority immediately without changing or deleting documents', async () => {
  const f = await prepare();
  await approver.post(`official-documents/${f.receipt.id}/approve`).expect(200);
  await approver.post(`official-documents/${f.receipt.id}/issue`).expect(200);
  await second.post(`verification-policies/${f.policyId}/withdraw`).expect(200);
  const r = await check('admission-letter', { reference: f.metadata.certificateNumber });
  expect(['NOT_FOUND', 'UNAVAILABLE']).toContain(r.body.status);
  expect(
    (await testDb().certificate.findUniqueOrThrow({ where: { id: f.receipt.id } })).status,
  ).toBe('ISSUED');
});
it('requires exact leading-zero registration identifiers and owner authentication, without granting account access', async () => {
  const student = await activatedStudent(app, admin, '000000');
  const r = await testDb().studentRegistration.findUniqueOrThrow({
    where: { id: student.registrationId },
  });
  await policy(r.programId, 'registration');
  expect((await check('registration', { reference: student.registrationNumber })).body.status).toBe(
    'AUTHENTICATION_REQUIRED',
  );
  expect(
    (await check('registration', { reference: student.registrationNumber }, student)).body.status,
  ).toBe('ACTIVE');
  expect(
    (await check('registration', { reference: student.registrationNumber.slice(1) }, student)).body
      .status,
  ).toBe('INVALID');
  const other = await activatedStudent(app, admin);
  expect(
    (await check('registration', { reference: student.registrationNumber }, other)).body.status,
  ).toBe('INVALID');
  await testDb().studentRegistration.update({ where: { id: r.id }, data: { status: 'SUSPENDED' } });
  expect(
    (await check('registration', { reference: student.registrationNumber }, student)).body.status,
  ).toBe('INACTIVE');
  await http(app).get('/api/v1/student/me').expect(401);
});
it('fails closed on audit errors and never audits raw references or QR credentials', async () => {
  const f = await prepare();
  const spy = vi.spyOn(app.get(AuditService), 'writeAuditEvent');
  await check('admission-letter', { reference: f.metadata.certificateNumber });
  expect(JSON.stringify(spy.mock.calls)).not.toContain(f.metadata.certificateNumber);
  spy.mockRejectedValueOnce(new Error('PRIVATE-AUDIT-ERROR'));
  const r = await check('admission-letter', { reference: `NO-${randomUUID()}` });
  expect(r.status).toBe(503);
  expect(JSON.stringify(r.body)).not.toContain('PRIVATE-AUDIT-ERROR');
});
it('limits distributed guesses of one document and rejects malformed QR/query payloads', async () => {
  const reference = `NO-${randomUUID()}`;
  for (let i = 0; i < 10; i++) expect((await check('certificate', { reference })).status).toBe(200);
  expect((await check('certificate', { reference })).status).toBe(429);
  expect((await check('certificate', { token: 'invalid' })).status).toBe(400);
  expect(
    (await check('certificate', { reference, token: randomBytes(32).toString('base64url') }))
      .status,
  ).toBe(400);
  await http(app)
    .post('/api/v1/public/verify/certificate?token=hidden')
    .send({ contractVersion: 2, reference })
    .expect(400);
});
it('publishes only attested, independently reviewed results and isolates student ownership', async () => {
  const examAdmin = await staff(app, ['EXAM_ADMIN']);
  const f = await resultsFixture(admin, examAdmin, {
    subjects: [
      {
        period: 1,
        maxMarks: 100,
        components: [
          { name: 'Internal', maxMarks: 30 },
          { name: 'External', maxMarks: 70 },
        ],
      },
    ],
  });
  const exam = await f.examination(),
    student = await f.student();
  const policyId = await policy(f.program.id, 'result');
  const ps = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: f.curriculum.id },
  });
  const draft = savedDraftSchema.parse(
    (
      await examAdmin
        .post('draft-results', {
          context: { ...contextFor(f, exam), periodNumber: exam.period.number },
          registrationId: student.registrationId,
          programSubjectId: ps.id,
          reExamApplicationId: null,
          expectedVersion: null,
          marks: {
            internalMarks: '20',
            externalMarks: '60',
            practicalMarks: null,
            otherMarks: null,
            totalMarks: '80',
          },
        })
        .expect(201)
    ).body,
  );
  const row = await testDb().result.findUniqueOrThrow({
    where: { id: draft.resultId },
    include: { items: true },
  });
  const agent = browser(app),
    code = await issueCode(admin, student.registrationId);
  expect(
    (
      await activate(agent, {
        registrationNumber: student.registrationNumber,
        activationCode: code,
      })
    ).status,
  ).toBe(200);
  const lookup = async () => {
    const csrf = await studentCsrf(agent);
    const response = await agent
      .post('/api/v1/public/verify/result')
      .set('X-CSRF-Token', csrf)
      .send({ contractVersion: 2, reference: student.registrationNumber, periodNumber: 1 });
    return {
      body: officialVerificationResponseSchema.parse(response.body),
      status: response.status,
    };
  };
  expect((await lookup()).body.status).toBe('UNPUBLISHED');
  await admin
    .post(`official-results/${row.id}/publish`, { policyId, expectedVersion: row.version })
    .expect(409);
  await second
    .post(`official-results/${row.id}/attest`, {
      policyId,
      expectedVersion: row.version,
      authorityReference: 'Synthetic recorded examination decision',
      outcome: 'PASS',
      totalMarks: '80',
      maxMarks: '100',
      sgpa: null,
      cgpa: null,
      subjects: row.items.map((i) => ({ id: i.id, status: 'PASS', grade: 'A' })),
    })
    .expect(200);
  const updated = await testDb().result.findUniqueOrThrow({ where: { id: row.id } });
  await examAdmin
    .post(`result-review/${row.id}/submit`, {
      requestId: randomUUID(),
      expectedVersion: updated.version,
      confirmed: true,
    })
    .expect(200);
  await examAdmin
    .post(`result-review/${row.id}/approve`, {
      requestId: randomUUID(),
      expectedVersion: updated.version + 1,
      confirmed: true,
    })
    .expect(403);
  await second
    .post(`result-review/${row.id}/approve`, {
      requestId: randomUUID(),
      expectedVersion: updated.version + 1,
      confirmed: true,
    })
    .expect(403);
  await admin
    .post(`result-review/${row.id}/approve`, {
      requestId: randomUUID(),
      expectedVersion: updated.version + 1,
      confirmed: true,
    })
    .expect(200);
  await admin
    .post(`official-results/${row.id}/publish`, { policyId, expectedVersion: updated.version + 2 })
    .expect(200);
  const result = await lookup();
  expect(result.body.status).toBe('VALID');
  expect(result.body.results?.[0]?.subjects[0]).toMatchObject({
    totalMarks: '80',
    grade: 'A',
    status: 'PASS',
  });
  const own = await agent.get('/api/v1/student/results').expect(200);
  expect(studentResultsPageSchema.parse(own.body).publicationAvailable).toBe(true);
  const other = await activatedStudent(app, admin);
  await other.agent.get(`/api/v1/student/results/${row.id}`).expect(404);
  await admin.post(`official-results/${row.id}/withdraw`).expect(200);
  expect((await lookup()).body.status).toBe('UNPUBLISHED');
});

it('excludes synthetic issued snapshots and wrong document kinds without exposing a PDF', async () => {
  const f = await prepare();
  const registration = await testDb().studentRegistration.findUniqueOrThrow({
    where: { id: f.student.registrationId },
  });
  const sample = await testDb().certificate.create({
    data: {
      studentRegistrationId: registration.id,
      programId: registration.programId,
      documentType: 'ADMISSION_LETTER',
      status: 'DRAFT',
      sourceSnapshot: { usage: 'SYNTHETIC_ONLY' },
    },
  });
  const number = `SAMPLE-TEST-${randomUUID().slice(0, 8)}`;
  await testDb().certificate.update({
    where: { id: sample.id },
    data: {
      status: 'ISSUED',
      certificateNumber: number,
      verificationToken: randomBytes(32).toString('base64url'),
      issueDate: new Date(),
      issuedAt: new Date(),
      approvedAt: new Date(),
      generatedByUserId: maker.user.id,
      approvedByUserId: approver.user.id,
      issuedByUserId: approver.user.id,
      pdfStorageKey: 'synthetic/no-official-file.pdf',
      pdfHash: 'a'.repeat(64),
    },
  });
  const storage = vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'getObject');
  expect((await check('admission-letter', { reference: number })).body.status).toBe('NOT_FOUND');
  expect(
    (await check('certificate', { reference: f.metadata.certificateNumber })).body.status,
  ).not.toBe('ISSUED');
  expect(storage).not.toHaveBeenCalled();
});
it('allows authorized private review and refuses to issue a changed stored PDF', async () => {
  const f = await prepare();
  await http(app).get(`/api/v1/official-documents/${f.receipt.id}/file`).expect(401);
  await f.student.agent.get(`/api/v1/official-documents/${f.receipt.id}/file`).expect(401);
  await approver.get(`official-documents/${f.receipt.id}/file`).expect(200);
  await approver.post(`official-documents/${f.receipt.id}/approve`).expect(200);
  vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'getObject').mockResolvedValue(
    Buffer.from('tampered-test-document'),
  );
  await approver.post(`official-documents/${f.receipt.id}/issue`).expect(409);
  expect(
    (await testDb().certificate.findUniqueOrThrow({ where: { id: f.receipt.id } })).status,
  ).toBe('APPROVED');
});

it('serializes document issuance with a concurrent registration suspension', async () => {
  const f = await prepare();
  await approver.post(`official-documents/${f.receipt.id}/approve`).expect(200);
  let release: (() => void) | undefined, acquired: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const changing = testDb().$transaction(
    async (tx) => {
      await tx.studentRegistration.update({
        where: { id: f.student.registrationId },
        data: { status: 'SUSPENDED' },
      });
      acquired?.();
      await hold;
    },
    { timeout: 15000 },
  );
  await locked;
  const issue = approver
    .post(`official-documents/${f.receipt.id}/issue`)
    .then((response) => response);
  let waited = false;
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rows = await testDb().$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%student_registrations%') AS waiting`;
      if (rows[0]?.waiting) {
        waited = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    release?.();
    await changing;
  }
  const response = await issue;
  expect(waited).toBe(true);
  expect(response.status).toBe(403);
  expect(
    (await testDb().certificate.findUniqueOrThrow({ where: { id: f.receipt.id } })).status,
  ).toBe('APPROVED');
});
