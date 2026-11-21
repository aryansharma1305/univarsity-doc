/**
 * Public-verification acceptance (synthetic, isolated test database only).
 *
 * Exercises the real HTTP API end to end with OFFICIAL_VERIFICATION_ENABLED=true and an OFFICIAL
 * (not SYNTHETIC_ONLY) policy definition, using real role grants instead of SUPER_ADMIN wherever the
 * code-defined role mapping allows it. Every record is created through existing staff/student API
 * endpoints; the database is only read to observe state. A second application instance with the
 * switch off shows the default production behaviour against the same records.
 *
 * Each `it` is one acceptance step; steps share state and run in order.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignCurriculumResultSchema,
  certificateRequestSchema,
  curriculumDetailSchema,
  examinationDetailSchema,
  issuedActivationCodesSchema,
  officialDocumentReceiptSchema,
  officialVerificationResponseSchema,
  programSchema,
  savedDraftSchema,
  studentIssuedDocumentsSchema,
  subjectSchema,
} from '@docversity/validation';
import type { RoleName } from '@docversity/types';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { IdentifierHasher } from '../../src/auth/identifier-hasher.js';
import { browser, createTestApp, http, realConfig, staff, testDb, uniqueCode } from '../helpers.js';
import { activate, STUDENT_PASSWORD, studentCsrf } from '../student-auth/support.js';
import { staticPdf } from '../historical-documents/support.js';

type Staff = Awaited<ReturnType<typeof staff>>;
type Agent = ReturnType<typeof browser>;
type Service = 'admission-letter' | 'certificate' | 'registration' | 'result';

const DEFINITION = {
  usage: 'OFFICIAL',
  institutionName: 'Acceptance Test University (local only)',
  authorizationReference: 'LOCAL ACCEPTANCE FIXTURE - NOT A UNIVERSITY DECISION',
  discloseProgram: true,
  discloseIssueDate: true,
  identityFactor: 'AUTHENTICATED_OWNER',
  resultMode: 'REVIEWED_VALUES_ONLY',
} as const;
const APPLICATION = {
  certificateType: 'TRANSCRIPT',
  eligibilityReference: 'Local acceptance active-registration rule',
  fields: { purposeRequired: true, remarksAllowed: false },
  evidence: { requirement: 'NONE', authorityReference: 'Local acceptance evidence rule' },
  fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'Local acceptance fee rule' },
  actions: ['SUBMIT', 'RESPOND', 'CANCEL'],
  reviewAuthorityReference: 'Local acceptance review rule',
} as const;

let on: INestApplication, off: INestApplication;
const people = {} as Record<
  | 'proposer'
  | 'policyApprover'
  | 'registrar'
  | 'examAdmin'
  | 'attester'
  | 'superAttester'
  | 'superSubmitter'
  | 'certAdmin'
  | 'approver'
  | 'viewer',
  Staff
>;
const s = {
  programId: '',
  programName: '',
  sessionId: '',
  curriculumId: '',
  programSubjectId: '',
  examinationId: '',
  policies: {} as Record<Service, string>,
};
interface Learner {
  registrationId: string;
  registrationNumber: string;
  agent: Agent;
}
let alice: Learner, bob: Learner;
const docs = {
  admission: { id: '', number: '', token: '' },
  transcript: { id: '', number: '', token: '' },
};
let resultId = '';
const pdf = staticPdf('', 'ACCEPTANCE');

async function resetBudgets(app: INestApplication) {
  const hash = app.get(IdentifierHasher);
  await app
    .get(RateLimiter)
    .clear('public-verification-v1', [
      'global',
      hash.hash('public-verification:client', '::ffff:127.0.0.1'),
      hash.hash('public-verification:client', '127.0.0.1'),
    ]);
}
async function verify(
  service: Service,
  body: Record<string, unknown>,
  options: { as?: Agent; app?: INestApplication; raw?: boolean } = {},
) {
  const app = options.app ?? on;
  await resetBudgets(app);
  const agent = options.as;
  const csrf = agent ? await studentCsrf(agent) : '';
  const req = (agent ?? http(app)).post(`/api/v1/public/verify/${service}`);
  const r = await (agent ? req.set('X-CSRF-Token', csrf) : req).send(
    options.raw ? body : { contractVersion: 2, ...body },
  );
  const parsed = officialVerificationResponseSchema.safeParse(r.body);
  return { http: r.status, headers: r.headers, body: parsed.success ? parsed.data : undefined };
}
async function learner(prefix: string): Promise<Learner> {
  const registrationNumber = `000${prefix}${String(Date.now()).slice(-6)}${randomBytes(2).toString('hex').toUpperCase()}`;
  const created = (
    await people.registrar
      .post('students', {
        student: { fullName: `Acceptance Learner ${prefix}` },
        registration: {
          registrationNumber,
          programId: s.programId,
          academicSessionId: s.sessionId,
        },
      })
      .expect(201)
  ).body as { registrations: { id: string }[] };
  const registrationId = created.registrations[0]?.id ?? '';
  expect(
    assignCurriculumResultSchema.parse(
      (
        await people.registrar
          .post(`curricula/${s.curriculumId}/registrations`, { registrationIds: [registrationId] })
          .expect(200)
      ).body,
    ).assigned,
  ).toBe(1);
  const code = issuedActivationCodesSchema.parse(
    (
      await people.registrar
        .post('student-accounts/activation-codes', { registrationIds: [registrationId] })
        .expect(200)
    ).body,
  ).issued[0]?.code;
  const agent = browser(on);
  expect((await activate(agent, { registrationNumber, activationCode: code ?? '' })).status).toBe(
    200,
  );
  return { registrationId, registrationNumber, agent };
}
async function upload(by: Staff, metadata: Record<string, unknown>, file = pdf) {
  return by.agent
    .post('/api/v1/official-documents')
    .set('X-CSRF-Token', by.csrf)
    .field('metadata', JSON.stringify(metadata))
    .attach('file', file, { filename: 'document.pdf', contentType: 'application/pdf' });
}
async function template(type: 'ADMISSION_LETTER' | 'TRANSCRIPT', policyId: string) {
  const t = (
    await people.certAdmin
      .post('official-documents/templates', {
        policyId,
        programId: s.programId,
        documentType: type,
        name: uniqueCode(`ACCEPT-${type}`),
      })
      .expect(201)
  ).body as { id: string };
  // Same-person activation is refused; a separate approver activates.
  await people.certAdmin.post(`official-documents/templates/${t.id}/approve`).expect(403);
  await people.approver.post(`official-documents/templates/${t.id}/approve`).expect(200);
  return t.id;
}
const tokenOf = (url?: string) => new URL(url ?? 'http://x/').hash.replace('#token=', '');

beforeAll(async () => {
  // Run as a non-test deployment: outside NODE_ENV=test SYNTHETIC_ONLY policies are refused, so only
  // the OFFICIAL path (gated by OFFICIAL_VERIFICATION_ENABLED) can be exercised.
  on = await createTestApp(
    realConfig({ NODE_ENV: 'development', OFFICIAL_VERIFICATION_ENABLED: true }),
  );
  off = await createTestApp(
    realConfig({ NODE_ENV: 'development', OFFICIAL_VERIFICATION_ENABLED: false }),
  );
  const roles: Record<keyof typeof people, RoleName> = {
    proposer: 'SUPER_ADMIN',
    policyApprover: 'SUPER_ADMIN',
    registrar: 'REGISTRAR',
    examAdmin: 'EXAM_ADMIN',
    attester: 'EXAM_ADMIN',
    superAttester: 'SUPER_ADMIN',
    superSubmitter: 'SUPER_ADMIN',
    certAdmin: 'CERTIFICATE_ADMIN',
    approver: 'APPROVER',
    viewer: 'VIEWER',
  };
  for (const [key, role] of Object.entries(roles))
    people[key as keyof typeof people] = await staff(on, [role]);
}, 60_000);
afterAll(async () => {
  await on.close();
  await off.close();
});

describe('public verification acceptance (OFFICIAL_VERIFICATION_ENABLED=true)', () => {
  it('A1 seeds a program, session, curriculum, examination and two students through the API', async () => {
    const registrar = people.registrar;
    const program = programSchema.parse(
      (
        await registrar
          .post('programs', {
            code: uniqueCode('ACC'),
            name: `Acceptance Course ${randomUUID().slice(0, 6)}`,
            level: 'CERTIFICATE',
            durationValue: 1,
            durationUnit: 'YEARS',
            academicStructure: 'SEMESTER_WISE',
            periodCount: 2,
          })
          .expect(201)
      ).body,
    );
    s.programId = program.id;
    s.programName = program.name;
    s.sessionId = (
      (
        await registrar
          .post('academic-sessions', {
            code: uniqueCode('ACS'),
            name: 'Acceptance session',
            status: 'ACTIVE',
          })
          .expect(201)
      ).body as { id: string }
    ).id;
    const subject = subjectSchema.parse(
      (
        await registrar
          .post('subjects', {
            code: uniqueCode('ASB'),
            name: 'Acceptance subject',
            category: 'THEORY',
          })
          .expect(201)
      ).body,
    );
    const draft = curriculumDetailSchema.parse(
      (
        await registrar
          .post(`programs/${program.id}/curricula`, {
            versionCode: uniqueCode('V2026'),
            name: 'Acceptance syllabus',
            effectiveFrom: '2026-01-01',
            effectiveTo: '2026-12-31',
          })
          .expect(201)
      ).body,
    );
    await registrar
      .post(`curricula/${draft.id}/subjects`, {
        subjectId: subject.id,
        periodNumber: 1,
        classification: 'THEORY',
        maxMarks: 100,
        components: [
          { name: 'Internal', maxMarks: 30 },
          { name: 'External', maxMarks: 70 },
        ],
      })
      .expect(201);
    await registrar.post(`curricula/${draft.id}/activate`).expect(200);
    s.curriculumId = draft.id;
    s.programSubjectId = (
      await testDb().programSubject.findFirstOrThrow({ where: { curriculumId: draft.id } })
    ).id;
    const exam = examinationDetailSchema.parse(
      (
        await people.examAdmin
          .post('examinations', {
            code: uniqueCode('AEX'),
            name: 'Acceptance examination',
            curriculumId: draft.id,
            academicSessionId: s.sessionId,
            periodNumber: 1,
            kind: 'REGULAR',
            examSession: 'Acceptance session 2026',
          })
          .expect(201)
      ).body,
    );
    await people.examAdmin.post(`examinations/${exam.id}/open`).expect(200);
    s.examinationId = exam.id;
    alice = await learner('A');
    bob = await learner('B');
    expect(alice.registrationNumber.startsWith('000')).toBe(true);
  });

  it('A2 before any policy every service is UNAVAILABLE (no disclosure by default)', async () => {
    const unavailable = {
      status: 'UNAVAILABLE',
      message:
        'The university has not enabled online verification for this service. No record was checked. Contact the university records office for help.',
    };
    for (const service of ['admission-letter', 'certificate'] as const)
      expect((await verify(service, { reference: 'ACC-NOTHING-1' })).body).toMatchObject(
        unavailable,
      );
    for (const service of ['registration', 'result'] as const)
      expect(
        (await verify(service, { reference: alice.registrationNumber }, { as: alice.agent })).body,
      ).toMatchObject(unavailable);
  });

  it('A3 policy proposal/approval: only verificationPolicies.manage, approver must differ from proposer', async () => {
    const body = (service: Service) => ({
      service,
      programId: s.programId,
      definition: {
        ...DEFINITION,
        ...(service === 'certificate' ? { application: APPLICATION } : {}),
      },
    });
    // No operational role other than SUPER_ADMIN can propose or approve policies.
    for (const role of ['registrar', 'examAdmin', 'certAdmin', 'approver', 'viewer'] as const)
      await people[role].post('verification-policies', body('registration')).expect(403);
    for (const service of ['admission-letter', 'certificate', 'registration', 'result'] as const) {
      const p = (await people.proposer.post('verification-policies', body(service)).expect(201))
        .body as { id: string; status: string };
      expect(p.status).toBe('DRAFT');
      await people.proposer.post(`verification-policies/${p.id}/approve`).expect(403);
      await people.approver.post(`verification-policies/${p.id}/approve`).expect(403);
      const approved = (
        await people.policyApprover.post(`verification-policies/${p.id}/approve`).expect(200)
      ).body as { status: string; approvedById: string; proposedById: string };
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedById).not.toBe(approved.proposedById);
      s.policies[service] = p.id;
    }
    // Any staff role can read the policy list (certificates.read).
    await people.viewer.get(`verification-policies?programId=${s.programId}`).expect(200);
  });

  it('A4 admission letter: prepare -> unissued NOT_FOUND -> approve -> issue -> VALID by number and QR', async () => {
    const templateId = await template('ADMISSION_LETTER', s.policies['admission-letter']);
    docs.admission.number = `ACC-AL-${randomBytes(4).toString('hex').toUpperCase()}`;
    const metadata = {
      registrationId: alice.registrationId,
      policyId: s.policies['admission-letter'],
      templateId,
      documentType: 'ADMISSION_LETTER',
      certificateNumber: docs.admission.number,
      issueDate: '2026-11-01',
      authorityReference: 'Local acceptance admission authority',
    };
    // REGISTRAR holds certificates.generate too; APPROVER and VIEWER do not.
    expect((await upload(people.viewer, metadata)).status).toBe(403);
    const prepared = await upload(people.certAdmin, metadata);
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
    docs.admission.id = officialDocumentReceiptSchema.parse(prepared.body).id;
    expect(
      (await verify('admission-letter', { reference: docs.admission.number })).body?.status,
    ).toBe('NOT_FOUND');
    await people.certAdmin.post(`official-documents/${docs.admission.id}/approve`).expect(403);
    await people.approver.post(`official-documents/${docs.admission.id}/issue`).expect(409);
    await people.approver.post(`official-documents/${docs.admission.id}/approve`).expect(200);
    expect(
      (await verify('admission-letter', { reference: docs.admission.number })).body?.status,
    ).toBe('NOT_FOUND');
    const issued = officialDocumentReceiptSchema.parse(
      (await people.approver.post(`official-documents/${docs.admission.id}/issue`).expect(200))
        .body,
    );
    expect(issued.status).toBe('ISSUED');
    expect(issued.verificationUrl).toMatch(/\/verify\/admission-letter#token=[A-Za-z0-9_-]{43}$/);
    docs.admission.token = tokenOf(issued.verificationUrl);
    const byNumber = await verify('admission-letter', { reference: docs.admission.number });
    expect(byNumber.http).toBe(200);
    expect(byNumber.headers['cache-control']).toBe('no-store');
    expect(byNumber.body).toMatchObject({
      status: 'VALID',
      documentType: 'ADMISSION_LETTER',
      institution: DEFINITION.institutionName,
      program: s.programName,
      issueDate: '2026-11-01',
      maskedReference: `••••${docs.admission.number.slice(-4)}`,
    });
    expect(JSON.stringify(byNumber.body)).not.toMatch(/Acceptance Learner|registrationId|000A/);
    expect((await verify('admission-letter', { token: docs.admission.token })).body).toEqual(
      byNumber.body,
    );
    // Document kinds are isolated: an admission number is not a certificate.
    expect((await verify('certificate', { reference: docs.admission.number })).body?.status).toBe(
      'NOT_FOUND',
    );
  });

  it('A5 certificate (TRANSCRIPT): student request -> review -> prepare -> approve -> issue -> ISSUED by number and QR', async () => {
    const templateId = await template('TRANSCRIPT', s.policies.certificate);
    const csrf = await studentCsrf(alice.agent);
    const request = certificateRequestSchema.parse(
      (
        await alice.agent
          .post('/api/v1/student/certificate-requests')
          .set('X-CSRF-Token', csrf)
          .send({
            certificateType: 'TRANSCRIPT',
            purpose: 'Acceptance',
            submissionKey: randomUUID(),
          })
          .expect(201)
      ).body,
    );
    await people.certAdmin
      .post(`certificate-requests/${request.id}/record-review`, {
        version: 1,
        privateNote: 'Local acceptance review',
      })
      .expect(200);
    await people.certAdmin
      .post(`certificate-requests/${request.id}/complete-review`, { version: 2 })
      .expect(200);
    docs.transcript.number = `ACC-TR-${randomBytes(4).toString('hex').toUpperCase()}`;
    const base = {
      registrationId: alice.registrationId,
      policyId: s.policies.certificate,
      templateId,
      documentType: 'TRANSCRIPT',
      certificateNumber: docs.transcript.number,
      issueDate: '2026-11-02',
      authorityReference: 'Local acceptance certificate authority',
    };
    // A certificate cannot be prepared without a REVIEW_COMPLETED request.
    expect((await upload(people.certAdmin, base)).status).toBe(409);
    const prepared = await upload(people.certAdmin, { ...base, requestId: request.id });
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
    docs.transcript.id = officialDocumentReceiptSchema.parse(prepared.body).id;
    expect((await verify('certificate', { reference: docs.transcript.number })).body?.status).toBe(
      'NOT_FOUND',
    );
    await people.approver.post(`official-documents/${docs.transcript.id}/approve`).expect(200);
    const issued = officialDocumentReceiptSchema.parse(
      (await people.approver.post(`official-documents/${docs.transcript.id}/issue`).expect(200))
        .body,
    );
    docs.transcript.token = tokenOf(issued.verificationUrl);
    expect(docs.transcript.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const v = await verify('certificate', { token: docs.transcript.token });
    expect(v.body).toMatchObject({ status: 'ISSUED', documentType: 'TRANSCRIPT' });
    expect((await verify('certificate', { reference: docs.transcript.number })).body?.status).toBe(
      'ISSUED',
    );
  });

  it('A6 QR edge cases: unknown 43-char token NOT_FOUND; malformed tokens 400; token for wrong service NOT_FOUND', async () => {
    expect(
      (await verify('certificate', { token: randomBytes(32).toString('base64url') })).body?.status,
    ).toBe('NOT_FOUND');
    for (const token of [
      docs.transcript.token.slice(0, 42),
      `${docs.transcript.token}A`,
      `${docs.transcript.token.slice(0, 42)}=`,
      '',
    ])
      expect((await verify('certificate', { token })).http).toBe(400);
    expect((await verify('admission-letter', { token: docs.transcript.token })).body?.status).toBe(
      'NOT_FOUND',
    );
    // A QR token is not accepted for owner-only services.
    expect(
      (await verify('registration', { token: docs.admission.token }, { as: alice.agent })).body
        ?.status,
    ).toBe('INVALID');
  });

  it('A7 reference matching: certificate numbers are matched case-sensitively (registration numbers are not)', async () => {
    const lower = await verify('certificate', { reference: docs.transcript.number.toLowerCase() });
    // Observed behaviour, recorded for the acceptance report (see findings).
    expect(lower.body?.status).toBe('NOT_FOUND');
    const reg = await verify(
      'registration',
      { reference: alice.registrationNumber.toLowerCase() },
      { as: alice.agent },
    );
    expect(reg.body?.status).toBe('ACTIVE');
  });

  it('A8 owner documents: list/download for the owner only, staff and other students refused', async () => {
    const list = studentIssuedDocumentsSchema.parse(
      (await alice.agent.get('/api/v1/student/official-documents').expect(200)).body,
    );
    expect(list.map((d) => d.id).sort()).toEqual([docs.admission.id, docs.transcript.id].sort());
    expect(
      studentIssuedDocumentsSchema.parse(
        (await bob.agent.get('/api/v1/student/official-documents').expect(200)).body,
      ),
    ).toEqual([]);
    const route = `/api/v1/student/official-documents/${docs.admission.id}/download`;
    const own = await alice.agent.get(route).expect(200);
    expect(own.headers['content-type']).toContain('application/pdf');
    expect(own.headers['cache-control']).toBe('no-store');
    expect(own.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(own.body as Buffer, pdf)).toBe(0);
    await bob.agent.get(route).expect(404);
    await http(on).get(route).expect(401);
    await people.approver.agent.get(route).expect(401);
    // Staff private review copy requires historicalDocuments.read (EXAM_ADMIN lacks it).
    await people.examAdmin.get(`official-documents/${docs.admission.id}/file`).expect(403);
    await people.approver.get(`official-documents/${docs.admission.id}/file`).expect(200);
  });

  it('A9 registration verification: owner only, exact number, anonymous/staff/other students refused', async () => {
    const own = await verify(
      'registration',
      { reference: alice.registrationNumber },
      { as: alice.agent },
    );
    expect(own.body).toMatchObject({
      status: 'ACTIVE',
      program: s.programName,
      maskedReference: `••••${alice.registrationNumber.slice(-4)}`,
    });
    expect(
      (await verify('registration', { reference: alice.registrationNumber })).body?.status,
    ).toBe('AUTHENTICATION_REQUIRED');
    const staffCheck = await people.approver.agent
      .post('/api/v1/public/verify/registration')
      .set('X-CSRF-Token', people.approver.csrf)
      .send({ contractVersion: 2, reference: alice.registrationNumber });
    expect(officialVerificationResponseSchema.parse(staffCheck.body).status).toBe(
      'AUTHENTICATION_REQUIRED',
    );
    // Cross-student: Bob checking Alice's number gets the same answer as an unknown number.
    const cross = await verify(
      'registration',
      { reference: alice.registrationNumber },
      { as: bob.agent },
    );
    const unknown = await verify('registration', { reference: '000ZZZ999999' }, { as: bob.agent });
    expect(cross.body).toEqual(unknown.body);
    expect(cross.body?.status).toBe('INVALID');
    // Leading zeros are significant.
    expect(
      (
        await verify(
          'registration',
          { reference: alice.registrationNumber.replace(/^0+/, '') },
          { as: alice.agent },
        )
      ).body?.status,
    ).toBe('INVALID');
  });

  it('A10 results: draft -> attest -> submit -> independent approval -> publish (receipt) with role separation', async () => {
    const draft = savedDraftSchema.parse(
      (
        await people.examAdmin
          .post('draft-results', {
            context: {
              programId: s.programId,
              curriculumId: s.curriculumId,
              academicSessionId: s.sessionId,
              periodNumber: '1',
              examinationId: s.examinationId,
            },
            registrationId: alice.registrationId,
            programSubjectId: s.programSubjectId,
            reExamApplicationId: null,
            expectedVersion: null,
            marks: {
              internalMarks: '25',
              externalMarks: '60',
              practicalMarks: null,
              otherMarks: null,
              totalMarks: '85',
            },
          })
          .expect(201)
      ).body,
    );
    resultId = draft.resultId;
    const version = async () =>
      (await testDb().result.findUniqueOrThrow({ where: { id: resultId } })).version;
    const items = await testDb().resultItem.findMany({ where: { resultId } });
    const lookup = async (as = alice.agent, extra: Record<string, unknown> = {}) =>
      verify('result', { reference: alice.registrationNumber, ...extra }, { as });
    expect((await lookup()).body?.status).toBe('UNPUBLISHED');
    // Publication before attestation/approval is refused.
    await people.approver
      .post(`official-results/${resultId}/publish`, {
        policyId: s.policies.result,
        expectedVersion: await version(),
      })
      .expect(409);
    const attest = {
      policyId: s.policies.result,
      authorityReference: 'Local acceptance examination committee decision',
      outcome: 'PASS',
      totalMarks: '85',
      maxMarks: '100',
      sgpa: null,
      cgpa: null,
      subjects: items.map((i) => ({ id: i.id, status: 'PASS', grade: 'A' })),
    };
    await people.approver
      .post(`official-results/${resultId}/attest`, { ...attest, expectedVersion: await version() })
      .expect(403);
    await people.attester
      .post(`official-results/${resultId}/attest`, { ...attest, expectedVersion: await version() })
      .expect(200);
    await people.examAdmin
      .post(`result-review/${resultId}/submit`, {
        requestId: randomUUID(),
        expectedVersion: await version(),
        confirmed: true,
      })
      .expect(200);
    const approve = async (who: Staff) =>
      who.post(`result-review/${resultId}/approve`, {
        requestId: randomUUID(),
        expectedVersion: await version(),
        confirmed: true,
      });
    // results.approve is held by no operational role: APPROVER and EXAM_ADMIN are refused.
    expect((await approve(people.approver)).status).toBe(403);
    expect((await approve(people.examAdmin)).status).toBe(403);
    // The policy proposer (SUPER_ADMIN) is not a marks author, attester or submitter: allowed.
    expect((await approve(people.proposer)).status).toBe(200);
    expect((await lookup()).body?.status).toBe('UNPUBLISHED');
    // Internal review publish remains permanently disabled; official publication is separate.
    await people.approver
      .post(`result-review/${resultId}/publish`, {
        requestId: randomUUID(),
        expectedVersion: await version(),
        confirmed: true,
      })
      .expect(409);
    await people.examAdmin
      .post(`official-results/${resultId}/publish`, {
        policyId: s.policies.result,
        expectedVersion: await version(),
      })
      .expect(403);
    const published = await people.approver
      .post(`official-results/${resultId}/publish`, {
        policyId: s.policies.result,
        expectedVersion: await version(),
      })
      .expect(200);
    expect(published.body).toEqual({ id: resultId, status: 'PUBLISHED' });
    const receipt = await testDb().resultPublication.findUniqueOrThrow({ where: { resultId } });
    expect(receipt.policyId).toBe(s.policies.result);
    expect(receipt.publishedById).toBe(people.approver.user.id);
    expect(receipt.snapshotDigest).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      testDb().resultPublication.update({
        where: { resultId },
        data: { snapshotDigest: '0'.repeat(64) },
      }),
    ).rejects.toThrow();
  });

  it('A10b results separation of duties: a SUPER_ADMIN attester or submitter cannot approve', async () => {
    // Both hold results.approve, so the refusal comes from the service, not the permission guard.
    const draft = savedDraftSchema.parse(
      (
        await people.examAdmin
          .post('draft-results', {
            context: {
              programId: s.programId,
              curriculumId: s.curriculumId,
              academicSessionId: s.sessionId,
              periodNumber: '1',
              examinationId: s.examinationId,
            },
            registrationId: bob.registrationId,
            programSubjectId: s.programSubjectId,
            reExamApplicationId: null,
            expectedVersion: null,
            marks: {
              internalMarks: '20',
              externalMarks: '50',
              practicalMarks: null,
              otherMarks: null,
              totalMarks: '70',
            },
          })
          .expect(201)
      ).body,
    );
    const id = draft.resultId;
    const version = async () =>
      (await testDb().result.findUniqueOrThrow({ where: { id } })).version;
    const items = await testDb().resultItem.findMany({ where: { resultId: id } });
    await people.superAttester
      .post(`official-results/${id}/attest`, {
        policyId: s.policies.result,
        authorityReference: 'Local acceptance examination committee decision',
        outcome: 'PASS',
        totalMarks: '70',
        maxMarks: '100',
        sgpa: null,
        cgpa: null,
        subjects: items.map((i) => ({ id: i.id, status: 'PASS', grade: 'B' })),
        expectedVersion: await version(),
      })
      .expect(200);
    await people.superSubmitter
      .post(`result-review/${id}/submit`, {
        requestId: randomUUID(),
        expectedVersion: await version(),
        confirmed: true,
      })
      .expect(200);
    const approve = async (who: Staff) =>
      who.post(`result-review/${id}/approve`, {
        requestId: randomUUID(),
        expectedVersion: await version(),
        confirmed: true,
      });
    // attester != approver
    expect((await approve(people.superAttester)).status).toBe(403);
    // submitter != approver
    expect((await approve(people.superSubmitter)).status).toBe(403);
    const r = await testDb().result.findUniqueOrThrow({ where: { id } });
    expect(r.publicationStatus).toBe('UNDER_REVIEW');
    // An independent SUPER_ADMIN can still approve the same version.
    expect((await approve(people.proposer)).status).toBe(200);
  });

  it('A11 results lookup: owner sees published values; filters; other students and anonymous refused', async () => {
    const own = await verify(
      'result',
      { reference: alice.registrationNumber, periodNumber: 1 },
      { as: alice.agent },
    );
    expect(own.body?.status).toBe('VALID');
    expect(own.body?.results?.[0]).toMatchObject({
      usage: 'OFFICIAL',
      outcome: 'PASS',
      periodNumber: 1,
    });
    expect(own.body?.results?.[0]?.subjects[0]).toMatchObject({
      totalMarks: '85',
      grade: 'A',
      status: 'PASS',
    });
    expect(
      (
        await verify(
          'result',
          { reference: alice.registrationNumber, periodNumber: 2 },
          { as: alice.agent },
        )
      ).body?.status,
    ).toBe('UNPUBLISHED');
    expect((await verify('result', { reference: alice.registrationNumber })).body?.status).toBe(
      'AUTHENTICATION_REQUIRED',
    );
    expect(
      (await verify('result', { reference: alice.registrationNumber }, { as: bob.agent })).body
        ?.status,
    ).toBe('INVALID');
    expect(
      (await verify('result', { reference: bob.registrationNumber }, { as: bob.agent })).body
        ?.status,
    ).toBe('UNPUBLISHED');
    await alice.agent.get(`/api/v1/student/results/${resultId}`).expect(200);
    await bob.agent.get(`/api/v1/student/results/${resultId}`).expect(404);
  });

  it('A12 OFFICIAL_VERIFICATION_ENABLED=false: same records become UNAVAILABLE and OFFICIAL policies cannot be approved', async () => {
    expect(
      (await verify('admission-letter', { reference: docs.admission.number }, { app: off })).body
        ?.status,
    ).toBe('UNAVAILABLE');
    expect(
      (await verify('certificate', { token: docs.transcript.token }, { app: off })).body?.status,
    ).toBe('UNAVAILABLE');
    expect(
      (await verify('registration', { reference: alice.registrationNumber }, { app: off })).body
        ?.status,
    ).toBe('UNAVAILABLE');
    const a = await staff(off, ['SUPER_ADMIN']),
      b = await staff(off, ['SUPER_ADMIN']);
    const p = (
      await a
        .post('verification-policies', {
          service: 'registration',
          programId: s.programId,
          definition: DEFINITION,
        })
        .expect(201)
    ).body as { id: string };
    await b.post(`verification-policies/${p.id}/approve`).expect(403);
    // Owner downloads are disabled too while the switch is off.
    const offStudent = browser(off);
    const offCsrf = await studentCsrf(offStudent);
    const login = await offStudent
      .post('/api/v1/student-auth/login')
      .set('X-CSRF-Token', offCsrf)
      .send({
        registrationNumber: alice.registrationNumber,
        password: STUDENT_PASSWORD,
      });
    expect(login.status).toBe(200);
    expect(
      studentIssuedDocumentsSchema.parse(
        (await offStudent.get('/api/v1/student/official-documents').expect(200)).body,
      ),
    ).toEqual([]);
    await offStudent
      .get(`/api/v1/student/official-documents/${docs.admission.id}/download`)
      .expect(404);
  });

  it('A13 malformed and empty inputs are rejected with 400 and no echo', async () => {
    const cases: unknown[] = [
      {},
      { contractVersion: 2 },
      { contractVersion: 3, reference: 'ACC-1' },
      { contractVersion: 2, reference: '' },
      { contractVersion: 2, reference: 'ab' },
      { contractVersion: 2, reference: '   ' },
      { contractVersion: 2, reference: '<script>x</script>' },
      { contractVersion: 2, reference: 'A'.repeat(129) },
      { contractVersion: 2, reference: 'ACC 1 2' },
      { contractVersion: 2, reference: 'ACC-1', extra: true },
      { contractVersion: 2, reference: 'ACC-1', token: docs.admission.token },
      { contractVersion: 2, reference: 'ACC-1', periodNumber: 0 },
      { contractVersion: 2, reference: 'ACC-1', examinationId: 'not-a-uuid' },
      [],
    ];
    for (const body of cases) {
      const r = await verify('certificate', body as Record<string, unknown>, { raw: true });
      expect(r.http, JSON.stringify(body)).toBe(400);
    }
    await resetBudgets(on);
    const echoed = await http(on)
      .post('/api/v1/public/verify/certificate')
      .send({ contractVersion: 2, reference: 'ACC-1', secretField: 'LEAKME' })
      .expect(400);
    expect(JSON.stringify(echoed.body)).not.toMatch(/LEAKME|secretField/);
    await resetBudgets(on);
    await http(on)
      .post('/api/v1/public/verify/certificate?reference=ACC-1')
      .send({ contractVersion: 2, reference: 'ACC-1' })
      .expect(400);
    await resetBudgets(on);
    await http(on)
      .post('/api/v1/public/verify/certificate')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('contractVersion=2&reference=ACC-1')
      .expect(400);
    await http(on).get('/api/v1/public/verify/certificate').expect(404);
    await http(on).post('/api/v1/public/verify/transcript').send({}).expect(404);
    // Document-only services refuse result filters.
    expect(
      (await verify('certificate', { reference: docs.transcript.number, periodNumber: 1 })).body
        ?.status,
    ).toBe('INVALID');
  });

  it('A14 rate limits: 429 with Retry-After for the per-client and per-reference budgets', async () => {
    await resetBudgets(on);
    let limited;
    for (let i = 0; i < 21; i++) {
      const r = await http(on)
        .post('/api/v1/public/verify/admission-letter')
        .send({ contractVersion: 2, reference: `ACC-RL-${String(i)}` });
      if (r.status === 429) {
        limited = { i, r };
        break;
      }
    }
    expect(limited?.i).toBe(20);
    expect(Number(limited?.r.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited?.r.body).toMatchObject({ error: { code: 'PUBLIC_VERIFICATION_RATE_LIMITED' } });
    // Invalid bodies still consume the client budget (limit runs before validation).
    const invalid = await http(on).post('/api/v1/public/verify/admission-letter').send({});
    expect(invalid.status).toBe(429);
    // Per-reference budget: 10 checks/minute regardless of client budget resets.
    const reference = `ACC-REF-${randomUUID().slice(0, 8)}`;
    const statuses = [];
    for (let i = 0; i < 11; i++)
      statuses.push(await verify('certificate', { reference }).then((r) => r));
    expect(statuses.slice(0, 10).every((r) => r.http === 200)).toBe(true);
    expect(statuses[10]?.http).toBe(429);
    expect(Number(statuses[10]?.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('A15 revocation: reason required, REVOKED by number and QR, owner download withdrawn, no re-issue path', async () => {
    await people.certAdmin
      .post(`official-documents/${docs.transcript.id}/revoke`, { reason: 'Not permitted' })
      .expect(403);
    await people.approver.post(`official-documents/${docs.transcript.id}/revoke`, {}).expect(409);
    const revoked = await people.approver
      .post(`official-documents/${docs.transcript.id}/revoke`, {
        reason: 'Local acceptance revocation',
      })
      .expect(200);
    expect(officialDocumentReceiptSchema.parse(revoked.body).status).toBe('REVOKED');
    expect((await verify('certificate', { token: docs.transcript.token })).body?.status).toBe(
      'REVOKED',
    );
    const byNumber = await verify('certificate', { reference: docs.transcript.number });
    expect(byNumber.body?.status).toBe('REVOKED');
    expect(JSON.stringify(byNumber.body)).not.toContain('Local acceptance revocation');
    await alice.agent
      .get(`/api/v1/student/official-documents/${docs.transcript.id}/download`)
      .expect(404);
    // Revocation is terminal: a second revoke or re-issue is refused.
    await people.approver
      .post(`official-documents/${docs.transcript.id}/revoke`, { reason: 'again' })
      .expect(409);
    await people.approver.post(`official-documents/${docs.transcript.id}/issue`).expect(409);
  });

  it('A16 result withdrawal returns UNPUBLISHED; re-publication after withdrawal has no API path', async () => {
    await people.approver.post(`official-results/${resultId}/withdraw`).expect(200);
    expect(
      (await verify('result', { reference: alice.registrationNumber }, { as: alice.agent })).body
        ?.status,
    ).toBe('UNPUBLISHED');
    const r = await testDb().result.findUniqueOrThrow({ where: { id: resultId } });
    expect(r.publicationStatus).toBe('WITHHELD');
    await people.approver
      .post(`official-results/${resultId}/publish`, {
        policyId: s.policies.result,
        expectedVersion: r.version,
      })
      .expect(409);
    // Published (then withheld) marks stay frozen in the database (integrity probe, not seeding).
    await expect(
      testDb().result.update({ where: { id: resultId }, data: { totalMarks: '99' } }),
    ).rejects.toThrow();
  });

  it('A17 registration status is reflected; COMPLETED is reported as "inactive or suspended" (finding)', async () => {
    const status = async () =>
      (await verify('registration', { reference: bob.registrationNumber }, { as: bob.agent })).body;
    await people.registrar
      .patch(`registrations/${bob.registrationId}`, { status: 'COMPLETED' })
      .expect(200);
    // FINDING: a graduated (COMPLETED) registration gets the same status and message as a
    // suspended one. See docs/development/public-verification-acceptance-20261117.md.
    expect(await status()).toMatchObject({
      status: 'INACTIVE',
      message: 'This registration is inactive or suspended.',
    });
    await people.registrar
      .patch(`registrations/${bob.registrationId}`, { status: 'SUSPENDED' })
      .expect(200);
    expect((await status())?.status).toBe('INACTIVE');
    await people.policyApprover
      .post(`verification-policies/${s.policies['admission-letter']}/withdraw`)
      .expect(200);
    expect((await verify('admission-letter', { token: docs.admission.token })).body?.status).toBe(
      'UNAVAILABLE',
    );
  });
});
