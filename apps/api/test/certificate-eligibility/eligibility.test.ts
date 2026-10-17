import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  certificateApplicationPolicySchema,
  programCertificateEligibilitySchema,
  studentCertificateEligibilityV1Schema,
  studentRegistrationEligibilityResponseV1Schema,
  type StudentRegistrationEligibilityV1,
} from '@docversity/validation';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent, studentCsrf } from '../student-auth/support.js';
import { CertificateEligibilityService } from '../../src/certificate-eligibility/certificate-eligibility.service.js';
import { CertificatePoliciesService } from '../../src/certificate-requests/certificate-policies.service.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import type { ObjectStorage } from '@docversity/storage';

const AUTHORITY = {
  id: 'SYNTHETIC-ELIGIBILITY-APPROVER',
  authorityReference: 'SYNTHETIC TEST ONLY',
  approved: true,
  action: 'APPROVE_COURSE_CERTIFICATE_SET',
};

let app: INestApplication;
let admin: Staff, registrar: Staff, otherRegistrar: Staff, approverA: Staff, approverB: Staff;
let certificateAdmin: Staff, viewer: Staff, approverRole: Staff;
let student: Awaited<ReturnType<typeof activatedStudent>>;
let stranger: Awaited<ReturnType<typeof activatedStudent>>;
const courses: Record<'m3' | 'm6' | 'm18' | 'm24' | 'm36' | 'm12', string> = {
  m3: '',
  m6: '',
  m18: '',
  m24: '',
  m36: '',
  m12: '',
};

async function course(label: string, durationValue: number, durationUnit: 'MONTHS' | 'YEARS') {
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const p = await testDb().program.create({
    data: {
      code: `ELIG-${label}-${tag}`,
      name: `Synthetic ${label} course`,
      durationValue,
      durationUnit,
    },
  });
  return p.id;
}
async function addRegistration(studentId: string, programId: string, sessionId: string) {
  const number = `ELIG-REG-${randomUUID().slice(0, 8).toUpperCase()}`;
  return testDb().studentRegistration.create({
    data: {
      studentId,
      programId,
      academicSessionId: sessionId,
      registrationNumber: number,
      registrationNumberNormalized: number,
    },
  });
}
const view = async (who: Staff, programId: string) =>
  programCertificateEligibilitySchema.parse(
    (await who.get(`programs/${programId}/certificate-eligibility`).expect(200)).body,
  );
const propose = (who: Staff, programId: string, certificateTypes: string[], extra: object = {}) =>
  who.post(`programs/${programId}/certificate-eligibility/proposals`, {
    certificateTypes,
    authorityReference: 'Synthetic university decision',
    ...extra,
  });
function authorize() {
  vi.spyOn(app.get(CertificateEligibilityService), 'approvalAuthorityDefinition').mockReturnValue(
    AUTHORITY,
  );
}
async function eligibility(s: typeof student) {
  const r = await s.agent.get('/api/v1/student/certificate-eligibility').expect(200);
  expect(r.headers['cache-control']).toBe('no-store');
  return studentCertificateEligibilityV1Schema.parse(r.body);
}
const typesOf = (r: StudentRegistrationEligibilityV1 | undefined) =>
  Object.fromEntries((r?.certificates ?? []).map((c) => [c.certificateType, c.typeEligibility]));
const approvedTypes = (r: StudentRegistrationEligibilityV1 | undefined) =>
  (r?.certificates ?? [])
    .filter((c) => c.typeEligibility === 'APPROVED_FOR_COURSE')
    .map((c) => c.certificateType);

beforeAll(async () => {
  app = await createTestApp(realConfig({ NODE_ENV: 'test' }));
  admin = await staff(app, ['SUPER_ADMIN']);
  registrar = await staff(app, ['REGISTRAR']);
  otherRegistrar = await staff(app, ['REGISTRAR']);
  approverA = await staff(app, ['SUPER_ADMIN']);
  approverB = await staff(app, ['SUPER_ADMIN']);
  certificateAdmin = await staff(app, ['CERTIFICATE_ADMIN']);
  approverRole = await staff(app, ['APPROVER']);
  viewer = await staff(app, ['VIEWER']);
  courses.m3 = await course('3M', 3, 'MONTHS');
  courses.m6 = await course('6M', 6, 'MONTHS');
  courses.m18 = await course('18M', 18, 'MONTHS');
  courses.m24 = await course('24M', 2, 'YEARS');
  courses.m36 = await course('36M', 3, 'YEARS');
  courses.m12 = await course('12M', 1, 'YEARS');
  student = await activatedStudent(app, admin, 'ELIG-ONE');
  stranger = await activatedStudent(app, admin, 'ELIG-TWO');
});
beforeEach(async () => {
  await app.get(RateLimiter).clear(
    'certificate-eligibility-write',
    [registrar, otherRegistrar, approverA, approverB, admin].map((s) => `principal:${s.user.id}`),
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

describe('staff authorization', () => {
  it('lets eligibility readers view, hides it from others, and denies students and anonymous users', async () => {
    for (const who of [registrar, certificateAdmin, approverRole, admin])
      await who.get(`programs/${courses.m18}/certificate-eligibility`).expect(200);
    for (const role of ['VIEWER', 'EXAM_ADMIN'] as const) {
      const other = role === 'VIEWER' ? viewer : await staff(app, [role]);
      await other.get(`programs/${courses.m18}/certificate-eligibility`).expect(403);
    }
    await browser(app).get(`/api/v1/programs/${courses.m18}/certificate-eligibility`).expect(401);
    await student.agent.get(`/api/v1/programs/${courses.m18}/certificate-eligibility`).expect(401);
    await registrar.get(`programs/${randomUUID()}/certificate-eligibility`).expect(404);
  });

  it('allows only proposers to propose, and never certificate admins or approver-role staff', async () => {
    for (const who of [certificateAdmin, approverRole, viewer])
      await propose(who, courses.m6, ['COURSE_COMPLETION']).expect(403);
  });
});

describe('proposal validation (server-derived duration)', () => {
  it('derives the duration tier on the server and rejects client-supplied duration fields', async () => {
    const v = await view(registrar, courses.m24);
    expect(v.evaluation).toMatchObject({
      outcome: 'TIER',
      tier: 'MORE_THAN_ONE_YEAR',
      durationMonths: 24,
    });
    expect(v.evaluation.permittedTypes).not.toContain('MIGRATION');
    for (const extra of [
      { durationMonths: 36 },
      { durationValue: 3, durationUnit: 'YEARS' },
      { tier: 'MORE_THAN_TWO_YEARS' },
      { status: 'APPROVED' },
    ])
      await propose(registrar, courses.m24, ['MIGRATION'], extra).expect(400);
    // Exactly 24 months may not offer Migration, even when proposed.
    const r = await propose(registrar, courses.m24, ['TRANSCRIPT', 'MIGRATION']).expect(400);
    expect(JSON.stringify(r.body)).toContain('MIGRATION');
  });

  it('refuses any proposal for unresolved or missing durations', async () => {
    const v = await view(registrar, courses.m12);
    expect(v.evaluation).toMatchObject({
      outcome: 'UNRESOLVED',
      unresolvedReason: 'EXACTLY_TWELVE_MONTHS',
    });
    expect(v.canPropose).toBe(false);
    expect(new Set(v.types.map((t) => t.eligibility))).toEqual(new Set(['POLICY_UNRESOLVED']));
    await propose(registrar, courses.m12, ['TRANSCRIPT']).expect(409);
    await propose(registrar, student.master.program.id, ['TRANSCRIPT']).expect(409);
  });

  it('does not equate the training certificate with Course Completion', async () => {
    await propose(registrar, courses.m6, ['TRAINING_CERTIFICATE']).expect(400);
  });
});

describe('proposal → approval separation', () => {
  it('records a proposal with audit, keeps types pending and approval disabled without an authority', async () => {
    const v = programCertificateEligibilitySchema.parse(
      (await propose(registrar, courses.m3, ['COURSE_COMPLETION']).expect(200)).body,
    );
    expect(v.configuration).toBe('PENDING_APPROVAL');
    expect(v.pending).toMatchObject({
      status: 'PROPOSED',
      durationMonths: 3,
      tier: 'SHORT_COURSE',
    });
    expect(v.types.find((t) => t.certificateType === 'COURSE_COMPLETION')?.eligibility).toBe(
      'PENDING_COURSE_APPROVAL',
    );
    expect(v.approval.enabled).toBe(false);
    expect(v.boundaries.join(' ')).toMatch(/not Rector approval/);
    // Even SUPER_ADMIN cannot approve while the university has not authorized an approver.
    const adminView = await view(approverA, courses.m3);
    expect(adminView.canDecide).toBe(false);
    const pendingId = v.pending?.id ?? '';
    await approverA
      .post(`certificate-eligibility/${pendingId}/approve`, { version: 1 })
      .expect(403);
    const audits = await testDb().auditLog.findMany({
      where: { entityId: pendingId, action: 'CERTIFICATE_ELIGIBILITY_PROPOSED' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      certificateTypes: ['COURSE_COMPLETION'],
      durationMonths: 3,
    });
    // A second open proposal is refused.
    await propose(otherRegistrar, courses.m3, ['COURSE_COMPLETION']).expect(409);
  });

  it('never lets the proposer approve or reject their own proposal, even with an authority', async () => {
    authorize();
    const v = programCertificateEligibilitySchema.parse(
      (await propose(approverA, courses.m6, ['COURSE_COMPLETION']).expect(200)).body,
    );
    const id = v.pending?.id ?? '';
    expect(v.canDecide).toBe(false);
    await approverA.post(`certificate-eligibility/${id}/approve`, { version: 1 }).expect(403);
    await approverA
      .post(`certificate-eligibility/${id}/reject`, { version: 1, note: 'No' })
      .expect(403);
    // Registrars can propose but never approve.
    await registrar.post(`certificate-eligibility/${id}/approve`, { version: 1 }).expect(403);
    const decided = programCertificateEligibilitySchema.parse(
      (await approverB.post(`certificate-eligibility/${id}/approve`, { version: 1 }).expect(200))
        .body,
    );
    expect(decided.configuration).toBe('APPROVED');
    expect(decided.approved?.decidedBy?.id).toBe(approverB.user.id);
    // Stale or repeated decisions conflict.
    await approverB.post(`certificate-eligibility/${id}/approve`, { version: 1 }).expect(409);
  });

  it('lets one concurrent approval win', async () => {
    authorize();
    const v = programCertificateEligibilitySchema.parse(
      (
        await propose(registrar, courses.m36, [
          'TRANSCRIPT',
          'PROVISIONAL',
          'CHARACTER',
          'MIGRATION',
        ]).expect(200)
      ).body,
    );
    const id = v.pending?.id ?? '';
    const results = await Promise.all([
      approverA.post(`certificate-eligibility/${id}/approve`, { version: 1 }),
      approverB.post(`certificate-eligibility/${id}/approve`, { version: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('withdraws and rejects without granting anything, and rejection needs a note', async () => {
    authorize();
    const v = programCertificateEligibilitySchema.parse(
      (await propose(registrar, courses.m18, ['TRANSCRIPT']).expect(200)).body,
    );
    const id = v.pending?.id ?? '';
    await approverA.post(`certificate-eligibility/${id}/reject`, { version: 1 }).expect(400);
    await approverA
      .post(`certificate-eligibility/${id}/reject`, { version: 1, note: 'Wrong set' })
      .expect(200);
    const again = programCertificateEligibilitySchema.parse(
      (
        await propose(registrar, courses.m18, ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER']).expect(
          200,
        )
      ).body,
    );
    await otherRegistrar
      .post(`certificate-eligibility/${again.pending?.id ?? ''}/withdraw`, { version: 1 })
      .expect(200);
    const after = await view(registrar, courses.m18);
    expect(after.configuration).toBe('NOT_CONFIGURED');
    expect(after.history.map((h) => h.status)).toEqual(['WITHDRAWN', 'REJECTED']);
  });

  it('rolls back the proposal when its audit cannot be written', async () => {
    const id = await course('AUDIT', 24, 'MONTHS');
    vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
      new Error('audit down'),
    );
    await propose(registrar, id, ['TRANSCRIPT']).expect(500);
    expect(await testDb().programCertificateEligibility.count({ where: { programId: id } })).toBe(
      0,
    );
  });
});

describe('student contract v1', () => {
  let sessionId = '';
  beforeAll(async () => {
    sessionId = student.master.session.id;
    authorize();
    // 24-month course: approve the full tier set.
    const p24 = programCertificateEligibilitySchema.parse(
      (
        await propose(registrar, courses.m24, ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER']).expect(
          200,
        )
      ).body,
    );
    await approverA
      .post(`certificate-eligibility/${p24.pending?.id ?? ''}/approve`, { version: 1 })
      .expect(200);
    vi.restoreAllMocks();
    await addRegistration(student.studentId, courses.m24, sessionId);
    await addRegistration(student.studentId, courses.m6, sessionId);
    await addRegistration(student.studentId, courses.m12, sessionId);
  });

  it('returns every own registration with its own eligibility, never another student’s', async () => {
    const e = await eligibility(student);
    expect(e).toMatchObject({
      contract: 'docversity.student-certificate-eligibility',
      contractVersion: 1,
    });
    expect(e.registrations).toHaveLength(4);
    const byMonths = (m: number | null) =>
      e.registrations.find((r) => r.program.durationMonths === m);
    // 24 months (approved): T/P/C approved, Migration and Course Completion not offered.
    expect(typesOf(byMonths(24))).toEqual({
      TRANSCRIPT: 'APPROVED_FOR_COURSE',
      PROVISIONAL: 'APPROVED_FOR_COURSE',
      CHARACTER: 'APPROVED_FOR_COURSE',
      MIGRATION: 'NOT_OFFERED_FOR_COURSE',
      COURSE_COMPLETION: 'NOT_OFFERED_FOR_COURSE',
    });
    // 6 months (approved earlier in this file by a different person).
    expect(approvedTypes(byMonths(6))).toEqual(['COURSE_COMPLETION']);
    expect(byMonths(12)?.courseConfiguration).toBe('NOT_CONFIGURED');
    expect(byMonths(12)?.duration).toMatchObject({
      outcome: 'UNRESOLVED',
      unresolvedReason: 'EXACTLY_TWELVE_MONTHS',
    });
    expect(byMonths(null)?.duration.unresolvedReason).toBe('MISSING_DURATION');
    const own = new Set(e.registrations.map((r) => r.registrationId));
    expect(own.has(stranger.registrationId)).toBe(false);
    // Everything after type eligibility stays separate and unavailable.
    for (const r of e.registrations)
      for (const c of r.certificates) {
        expect(c).toMatchObject({
          applicationAvailability: 'NOT_AVAILABLE',
          courseCompletionStatus: 'NOT_EVALUATED',
          paymentVerification: 'NOT_AVAILABLE',
          rectorApproval: 'NOT_AVAILABLE',
          issuance: 'NOT_AVAILABLE',
        });
        expect(c.samplePreviewAllowed).toBe(c.typeEligibility === 'APPROVED_FOR_COURSE');
      }
    expect(
      byMonths(24)?.certificates.find((c) => c.certificateType === 'TRANSCRIPT')
        ?.samplePreviewTemplate,
    ).toEqual({
      templateId: 'sample-transcript',
      version: 1,
    });
  });

  it('serves one explicitly selected registration only to its owner', async () => {
    const e = await eligibility(student);
    const pick = e.registrations[0];
    if (!pick) throw new Error('Missing registration');
    const one = studentRegistrationEligibilityResponseV1Schema.parse(
      (
        await student.agent
          .get(`/api/v1/student/certificate-eligibility/registrations/${pick.registrationId}`)
          .expect(200)
      ).body,
    );
    expect(one.registration).toEqual(pick);
    await stranger.agent
      .get(`/api/v1/student/certificate-eligibility/registrations/${pick.registrationId}`)
      .expect(404);
    await student.agent
      .get(`/api/v1/student/certificate-eligibility/registrations/${randomUUID()}`)
      .expect(404);
    await student.agent
      .get('/api/v1/student/certificate-eligibility/registrations/not-a-uuid')
      .expect(404);
    await browser(app).get('/api/v1/student/certificate-eligibility').expect(401);
    await admin.get('student/certificate-eligibility').expect(401);
  });

  it('ignores client-supplied duration or course values entirely', async () => {
    for (const q of [
      'durationMonths=36',
      'durationValue=3&durationUnit=YEARS',
      'tier=MORE_THAN_TWO_YEARS',
      'programId=x',
    ])
      await student.agent.get(`/api/v1/student/certificate-eligibility?${q}`).expect(400);
    const token = await studentCsrf(student.agent);
    await student.agent
      .post('/api/v1/student/certificate-eligibility')
      .set('X-CSRF-Token', token)
      .send({ durationMonths: 36 })
      .expect(404);
    const e = await eligibility(student);
    expect(e.registrations.flatMap((r) => approvedTypes(r))).not.toContain('MIGRATION');
  });

  it('withdraws approval effect when the course duration changes, until re-approved', async () => {
    await testDb().program.update({
      where: { id: courses.m24 },
      data: { durationValue: 3, durationUnit: 'YEARS' },
    });
    try {
      const r = (await eligibility(student)).registrations.find(
        (x) => x.program.durationMonths === 36,
      );
      expect(r?.courseConfiguration).toBe('OUT_OF_DATE');
      expect(approvedTypes(r)).toEqual([]);
      expect(typesOf(r).MIGRATION).toBe('PENDING_COURSE_APPROVAL');
    } finally {
      await testDb().program.update({
        where: { id: courses.m24 },
        data: { durationValue: 2, durationUnit: 'YEARS' },
      });
    }
    const restored = (await eligibility(student)).registrations.find(
      (x) => x.program.durationMonths === 24,
    );
    expect(restored?.courseConfiguration).toBe('APPROVED');
  });

  it('follows a registration moved to another course, never carrying the old course’s approval', async () => {
    const reg = await addRegistration(stranger.studentId, courses.m24, sessionId);
    expect(
      approvedTypes(
        (await eligibility(stranger)).registrations.find((r) => r.registrationId === reg.id),
      ),
    ).toEqual(['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER']);
    await testDb().studentRegistration.update({
      where: { id: reg.id },
      data: { programId: courses.m3 },
    });
    const moved = (await eligibility(stranger)).registrations.find(
      (r) => r.registrationId === reg.id,
    );
    expect(moved?.program.durationMonths).toBe(3);
    expect(approvedTypes(moved)).toEqual([]);
    expect(typesOf(moved).COURSE_COMPLETION).toBe('PENDING_COURSE_APPROVAL');
  });

  it('reports application availability from Phase 12B policies without eligibility enabling it', async () => {
    const policy = certificateApplicationPolicySchema.parse({
      id: 'SYNTHETIC-TEST-POLICY',
      version: 1,
      certificateType: 'TRANSCRIPT',
      authorityReference: 'SYNTHETIC TEST ONLY',
      approved: true,
      submissionEnabled: true,
      eligibilityRule: 'SYNTHETIC_TEST_ONLY',
      eligibilityReference: 'Synthetic',
      fields: { purposeRequired: false, remarksAllowed: false },
      evidence: { requirement: 'NONE', authorityReference: 'Synthetic' },
      fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'Synthetic' },
      actions: ['SUBMIT'],
    });
    const before = await eligibility(student);
    expect(
      before.registrations
        .flatMap((r) => r.certificates)
        .every((c) => c.applicationAvailability === 'NOT_AVAILABLE'),
    ).toBe(true);
    vi.spyOn(app.get(CertificatePoliciesService), 'definitions').mockReturnValue([policy]);
    const after = await eligibility(student);
    for (const r of after.registrations)
      for (const c of r.certificates)
        expect(c.applicationAvailability).toBe(
          c.certificateType === 'TRANSCRIPT' ? 'AVAILABLE' : 'NOT_AVAILABLE',
        );
    // Approved eligibility for other types never turned their applications on.
    const r24 = after.registrations.find((r) => r.program.durationMonths === 24);
    expect(r24?.certificates.find((c) => c.certificateType === 'CHARACTER')).toMatchObject({
      typeEligibility: 'APPROVED_FOR_COURSE',
      applicationAvailability: 'NOT_AVAILABLE',
    });
  });

  it('never touches certificates, certificate requests or object storage', async () => {
    const put = vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'putObject');
    const before = await Promise.all([
      testDb().certificate.count(),
      testDb().certificateRequest.count(),
    ]);
    await eligibility(student);
    await view(registrar, courses.m24);
    expect(put).not.toHaveBeenCalled();
    expect(
      await Promise.all([testDb().certificate.count(), testDb().certificateRequest.count()]),
    ).toEqual(before);
  });
});
