import { DraftResultsService } from '../../src/results/draft-results.service.js';
import { OfficialResultsService } from '../../src/public-verification/official-results.service.js';
import { ResultReviewService } from '../../src/results/result-review.service.js';
import type { ObjectStorage } from '@docversity/storage';
import { AUDIT_ACTIONS } from '@docversity/types';
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
const APPLICATION_RULES = {
  certificateType: 'TRANSCRIPT',
  eligibilityReference: 'Synthetic active registration rule',
  fields: { purposeRequired: true, remarksAllowed: false },
  evidence: { requirement: 'NONE', authorityReference: 'Synthetic evidence approval' },
  fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'Synthetic fee approval' },
  actions: ['SUBMIT', 'RESPOND', 'CANCEL'],
  reviewAuthorityReference: 'Synthetic review authority',
};
async function policy(programId: string, service: string, application?: Record<string, unknown>) {
  const p = (
    await admin
      .post('verification-policies', {
        service,
        programId,
        definition: { ...definition, ...(application ? { application } : {}) },
      })
      .expect(201)
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
    type === 'TRANSCRIPT' ? APPLICATION_RULES : undefined,
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
  // The final approver attested an earlier version, so timestamp ordering would block publication.
  const earlierAttester = admin;
  const audit = app.get(AuditService);
  const writeAudit = audit.writeAuditEvent.bind(audit);
  // Transaction timestamps can disagree with the serialized result-version order.
  const clock = vi.spyOn(audit, 'writeAuditEvent').mockImplementation(async (event, tx) => {
    if (
      event.action === AUDIT_ACTIONS.officialResultPublished &&
      event.entityId === row.id &&
      event.metadata?.action === 'ATTEST'
    ) {
      await (tx ?? testDb()).auditLog.create({
        data: {
          actorUserId: earlierAttester.user.id,
          action: event.action,
          entityType: 'Result',
          entityId: row.id,
          metadata: { action: 'ATTEST', policyId, version: row.version + 1 },
          createdAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return;
    }
    await writeAudit(event, tx);
  });
  await earlierAttester
    .post(`official-results/${row.id}/attest`, {
      policyId,
      expectedVersion: row.version,
      authorityReference: 'Synthetic earlier examination decision',
      outcome: 'WITHHELD',
      totalMarks: null,
      maxMarks: null,
      sgpa: null,
      cgpa: null,
      subjects: row.items.map((i) => ({ id: i.id, status: 'WITHHELD', grade: null })),
    })
    .expect(200);
  clock.mockRestore();
  await second
    .post(`official-results/${row.id}/attest`, {
      policyId,
      expectedVersion: row.version + 1,
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
  const latestByTimestamp = await testDb().auditLog.findFirstOrThrow({
    where: {
      entityId: row.id,
      action: AUDIT_ACTIONS.officialResultPublished,
      metadata: { path: ['action'], equals: 'ATTEST' },
    },
    orderBy: { createdAt: 'desc' },
  });
  expect(latestByTimestamp.actorUserId).toBe(earlierAttester.user.id);
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

it('uses approved program-scoped application and review rules without synthetic evaluator overrides', async () => {
  const student = await activatedStudent(app, admin, 'REAL-POLICY-DESIGN');
  const r = await testDb().studentRegistration.findUniqueOrThrow({
    where: { id: student.registrationId },
  });
  const application = {
    certificateType: 'TRANSCRIPT',
    eligibilityReference: 'Synthetic active registration rule',
    fields: { purposeRequired: true, remarksAllowed: false },
    evidence: { requirement: 'NONE', authorityReference: 'Synthetic evidence approval' },
    fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'Synthetic fee approval' },
    actions: ['SUBMIT', 'RESPOND', 'CANCEL'],
    reviewAuthorityReference: 'Synthetic review approval',
  };
  const policyId = await policy(r.programId, 'certificate', application);
  const csrf = await studentCsrf(student.agent);
  const created = await student.agent
    .post('/api/v1/student/certificate-requests')
    .set('X-CSRF-Token', csrf)
    .send({
      certificateType: 'TRANSCRIPT',
      purpose: 'Synthetic official-rule design test',
      submissionKey: randomUUID(),
    })
    .expect(201);
  const request = certificateRequestSchema.parse(created.body);
  expect(request.policyId).toBe(policyId);
  await maker
    .post(`certificate-requests/${request.id}/record-review`, {
      version: 1,
      privateNote: 'Synthetic authorized review',
    })
    .expect(200);
  await maker
    .post(`certificate-requests/${request.id}/complete-review`, { version: 2 })
    .expect(200);
  const other = await activatedStudent(app, admin, 'OTHER-POLICY');
  const otherCsrf = await studentCsrf(other.agent);
  await other.agent
    .post('/api/v1/student/certificate-requests')
    .set('X-CSRF-Token', otherCsrf)
    .send({
      certificateType: 'TRANSCRIPT',
      purpose: 'Synthetic out-of-scope application',
      submissionKey: randomUUID(),
    })
    .expect(409);
  await second.post(`verification-policies/${policyId}/withdraw`).expect(200);
  await student.agent
    .post('/api/v1/student/certificate-requests')
    .set('X-CSRF-Token', csrf)
    .send({
      certificateType: 'CHARACTER',
      purpose: 'Synthetic unavailable application',
      submissionKey: randomUUID(),
    })
    .expect(409);
});
async function blockedOn(table: 'certificate_requests' | 'verification_policies') {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = await testDb().$queryRaw<
      { waiting: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%${table}%`}) AS waiting`;
    if (rows[0]?.waiting) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}
it('does not issue from a reviewed request closed concurrently', async () => {
  const f = await prepare('TRANSCRIPT');
  await approver.post(`official-documents/${f.receipt.id}/approve`).expect(200);
  const requestId = f.metadata.requestId;
  if (!requestId) throw new Error('Missing synthetic request');
  let release: (() => void) | undefined, acquired: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const closing = testDb().$transaction(
    async (tx) => {
      await tx.certificateRequest.update({
        where: { id: requestId },
        data: {
          status: 'CLOSED',
          version: 4,
          events: {
            create: { version: 4, status: 'CLOSED', action: 'CLOSE', actorUserId: maker.user.id },
          },
        },
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
    waited = await blockedOn('certificate_requests');
  } finally {
    release?.();
    await closing;
  }
  const response = await issue;
  expect(waited).toBe(true);
  expect(response.status).toBe(409);
  expect(
    (await testDb().certificate.findUniqueOrThrow({ where: { id: f.receipt.id } })).status,
  ).toBe('APPROVED');
});
it('rejects withdrawn attestation authority despite a replacement policy and allows correction', async () => {
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
    student = await f.student(),
    policyId = await policy(f.program.id, 'result');
  await policy(f.program.id, 'result');
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
  await second
    .post(`official-results/${row.id}/attest`, {
      policyId,
      expectedVersion: 1,
      authorityReference: 'Synthetic decision',
      outcome: 'PASS',
      totalMarks: '80',
      maxMarks: '100',
      sgpa: null,
      cgpa: null,
      subjects: row.items.map((i) => ({ id: i.id, status: 'PASS', grade: 'A' })),
    })
    .expect(200);
  await examAdmin
    .post(`result-review/${row.id}/submit`, {
      requestId: randomUUID(),
      expectedVersion: 2,
      confirmed: true,
    })
    .expect(200);
  let release: (() => void) | undefined, acquired: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const withdrawal = testDb().$transaction(
    async (tx) => {
      await tx.verificationPolicy.update({
        where: { id: policyId },
        data: { status: 'WITHDRAWN' },
      });
      acquired?.();
      await hold;
    },
    { timeout: 15000 },
  );
  await locked;
  const approve = admin
    .post(`result-review/${row.id}/approve`, {
      requestId: randomUUID(),
      expectedVersion: 3,
      confirmed: true,
    })
    .then((response) => response);
  let waited = false;
  try {
    waited = await blockedOn('verification_policies');
  } finally {
    release?.();
    await withdrawal;
  }
  const response = await approve;
  expect(waited).toBe(true);
  expect(response.status).toBe(409);
  expect(
    (await testDb().result.findUniqueOrThrow({ where: { id: row.id } })).publicationStatus,
  ).toBe('UNDER_REVIEW');
  await admin
    .post(`result-review/${row.id}/return`, {
      requestId: randomUUID(),
      expectedVersion: 3,
      confirmed: true,
      reason: 'Synthetic re-attestation under the replacement authority',
    })
    .expect(200);
});
it('retains independently approved application types and paginates staff authority records', async () => {
  const student = await activatedStudent(app, admin, 'MULTI-TYPE');
  const r = await testDb().studentRegistration.findUniqueOrThrow({
    where: { id: student.registrationId },
  });
  const transcript = await policy(r.programId, 'certificate', APPLICATION_RULES);
  const character = await policy(r.programId, 'certificate', {
    ...APPLICATION_RULES,
    certificateType: 'CHARACTER',
  });
  await policy(r.programId, 'certificate');
  const catalogue = (await student.agent.get('/api/v1/student/certificate-services').expect(200))
    .body as { data: { certificateType: string; available: boolean; policyId: string | null }[] };
  expect(catalogue.data.find((p) => p.certificateType === 'TRANSCRIPT')).toMatchObject({
    available: true,
    policyId: transcript,
  });
  expect(catalogue.data.find((p) => p.certificateType === 'CHARACTER')).toMatchObject({
    available: true,
    policyId: character,
  });
  const one = await admin
    .get(`verification-policies?programId=${r.programId}&pageSize=1&page=1`)
    .expect(200);
  const two = await admin
    .get(`verification-policies?programId=${r.programId}&pageSize=1&page=2`)
    .expect(200);
  const first = one.body as { data: { id: string }[]; meta: { total: number; totalPages: number } };
  const next = two.body as { data: { id: string }[] };
  expect(first.meta).toMatchObject({ total: 3, totalPages: 3 });
  expect(first.data[0]?.id).not.toBe(next.data[0]?.id);
  await admin.get('verification-policies?unapprovedFilter=true').expect(400);
  await http(app).get('/api/v1/verification-audit').expect(401);
  await student.agent.get('/api/v1/verification-audit').expect(401);
  await admin.get('verification-audit?pageSize=1').expect(200);
});
it('rejects a reviewed application from another program or a withdrawn application authority', async () => {
  const f = await prepare('TRANSCRIPT');
  const other = await activatedStudent(app, admin, 'SCOPE-B');
  const r = await testDb().studentRegistration.findUniqueOrThrow({
    where: { id: other.registrationId },
  });
  const number = `0000-B-${randomUUID().slice(0, 10)}`;
  const alternate = await testDb().studentRegistration.create({
    data: {
      studentId: f.student.studentId,
      programId: r.programId,
      academicSessionId: r.academicSessionId,
      registrationNumber: number,
      registrationNumberNormalized: number.toUpperCase(),
    },
  });
  const policyId = await policy(r.programId, 'certificate');
  const template = (
    await maker
      .post('official-documents/templates', {
        policyId,
        programId: r.programId,
        documentType: 'TRANSCRIPT',
        name: uniqueCode('SCOPE-TEMPLATE'),
      })
      .expect(201)
  ).body as { id: string };
  await approver.post(`official-documents/templates/${template.id}/approve`).expect(200);
  await maker.agent
    .post('/api/v1/official-documents')
    .set('X-CSRF-Token', maker.csrf)
    .field(
      'metadata',
      JSON.stringify({
        ...f.metadata,
        registrationId: alternate.id,
        policyId,
        templateId: template.id,
        certificateNumber: `OTHER-${randomUUID().slice(0, 12)}`,
      }),
    )
    .attach('file', f.pdf, { filename: 'synthetic.pdf', contentType: 'application/pdf' })
    .expect(409);
  await second.post(`verification-policies/${f.policyId}/withdraw`).expect(200);
  await approver.post(`official-documents/${f.receipt.id}/approve`).expect(403);
  const viewer = await staff(app, ['VIEWER']);
  await viewer.get(`official-documents/${f.receipt.id}/file`).expect(403);
});

it('paginates 0, 1, 100, 101 and 250 eligible official results in the database', async () => {
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
  const student = await f.student();
  const ps = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: f.curriculum.id },
  });
  const policyId = await policy(f.program.id, 'result');
  const official = app.get(OfficialResultsService),
    review = app.get(ResultReviewService);
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
  const page = async (number: number, total: number) => {
    const response = studentResultsPageSchema.parse(
      (await agent.get(`/api/v1/student/results?page=${number}&pageSize=50`).expect(200)).body,
    );
    expect(response.publicationAvailable).toBe(total > 0);
    expect(response.meta).toEqual({
      page: number,
      pageSize: 50,
      total,
      totalPages: Math.ceil(total / 50),
    });
    return response.data;
  };
  const publish = async (registrationId = student.registrationId, authority = policyId) => {
    const exam = await f.examination();
    const saved = await app.get(DraftResultsService).save(
      {
        context: { ...contextFor(f, exam), periodNumber: exam.period.number },
        registrationId,
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
      },
      examAdmin.user.id,
    );
    const draft = await testDb().result.findUniqueOrThrow({
      where: { id: saved.resultId },
      include: { items: true },
    });
    await official.attest(
      draft.id,
      {
        policyId: authority,
        expectedVersion: 1,
        authorityReference: 'Synthetic pagination fixture',
        outcome: 'PASS',
        totalMarks: '80',
        maxMarks: '100',
        sgpa: null,
        cgpa: null,
        subjects: draft.items.map((item) => ({ id: item.id, status: 'PASS', grade: 'A' })),
      },
      second.user.id,
    );
    await review.transition(
      draft.id,
      'SUBMIT',
      { requestId: randomUUID(), expectedVersion: 2, confirmed: true },
      examAdmin.user.id,
    );
    await review.transition(
      draft.id,
      'APPROVE',
      { requestId: randomUUID(), expectedVersion: 3, confirmed: true },
      admin.user.id,
    );
    await official.publish(draft.id, { policyId: authority, expectedVersion: 4 }, admin.user.id);
    return draft.id;
  };
  expect(await page(1, 0)).toEqual([]);
  // One older publication and a group of equal timestamps exercise both sort keys.
  const recent = new Date();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(recent.getTime() - 60_000);
  try {
    const oldest = await publish();
    vi.setSystemTime(recent);
    const newer: string[] = [];
    const ordered = () => [...newer].sort().concat(oldest);
    for (let count = 1; count <= 250; count++) {
      if (count > 1) newer.push(await publish());
      if ([1, 100, 101, 250].includes(count)) {
        const expected = ordered();
        const seen = [];
        for (let number = 1; number <= Math.ceil(count / 50); number++)
          seen.push(...(await page(number, count)));
        expect(seen.map((row) => row.id)).toEqual(expected);
        expect(await page(Math.ceil(count / 50) + 1, count)).toEqual([]);
        expect((await page(1, count)).map((row) => row.id)).toEqual(expected.slice(0, 50));
      }
    }
    const other = await f.student();
    await publish(other.registrationId);
    const withdrawn = await publish();
    await official.withdraw(withdrawn, admin.user.id);
    const withdrawnPolicy = await policy(f.program.id, 'result');
    await publish(student.registrationId, withdrawnPolicy);
    await admin.post(`verification-policies/${withdrawnPolicy}/withdraw`).expect(200);
    const exam = await f.examination();
    await testDb().result.create({
      data: { studentRegistrationId: student.registrationId, examinationId: exam.id },
    });
    expect((await page(5, 250)).map((row) => row.id)).toEqual(ordered().slice(200));
    const csrf = await studentCsrf(agent);
    const checked = officialVerificationResponseSchema.parse(
      (
        await agent
          .post('/api/v1/public/verify/result')
          .set('X-CSRF-Token', csrf)
          .send({ contractVersion: 2, reference: student.registrationNumber })
          .expect(200)
      ).body,
    );
    expect(checked.results?.map((row) => row.id)).toEqual(ordered().slice(0, 100));
  } finally {
    vi.useRealTimers();
  }
}, 180_000);
