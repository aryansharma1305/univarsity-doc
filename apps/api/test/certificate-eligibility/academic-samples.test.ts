import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ACADEMIC_SAMPLE_PINS, AcademicSampleIntegrityError } from '@docversity/documents';
import { programCertificateEligibilitySchema } from '@docversity/validation';
import type { ObjectStorage } from '@docversity/storage';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent } from '../student-auth/support.js';
import { CertificateEligibilityService } from '../../src/certificate-eligibility/certificate-eligibility.service.js';
import { AcademicSamplesService } from '../../src/certificate-eligibility/academic-samples.service.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { IdentifierHasher } from '../../src/auth/identifier-hasher.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import { Errors } from '../../src/common/app-error.js';

// Synthetic, test-only approval authority (accepted only under NODE_ENV=test). Never used in production.
const AUTHORITY = {
  id: 'SYNTHETIC-ELIGIBILITY-APPROVER',
  authorityReference: 'SYNTHETIC TEST ONLY',
  approved: true,
  action: 'APPROVE_COURSE_CERTIFICATE_SET',
};

let app: INestApplication;
let registrar: Staff, approver: Staff, admin: Staff;
let student: Awaited<ReturnType<typeof activatedStudent>>;
let single: Awaited<ReturnType<typeof activatedStudent>>;
let other: Awaited<ReturnType<typeof activatedStudent>>;
const reg: Record<string, string> = {};
const course: Record<string, string> = {};

async function program(label: string, value: number | null, unit: 'MONTHS' | 'YEARS' | null) {
  const p = await testDb().program.create({
    data: {
      code: `SAMPLE-${label}-${randomUUID().slice(0, 6).toUpperCase()}`,
      name: `Synthetic ${label} course`,
      durationValue: value,
      durationUnit: unit,
    },
  });
  return p.id;
}
async function register(studentId: string, programId: string, sessionId: string) {
  const number = `SAMPLE-REG-${randomUUID().slice(0, 8).toUpperCase()}`;
  const r = await testDb().studentRegistration.create({
    data: {
      studentId,
      programId,
      academicSessionId: sessionId,
      registrationNumber: number,
      registrationNumberNormalized: number,
    },
  });
  return r.id;
}
async function propose(programId: string, certificateTypes: string[]) {
  const r = await registrar
    .post(`programs/${programId}/certificate-eligibility/proposals`, {
      certificateTypes,
      authorityReference: 'Synthetic university decision',
    })
    .expect(200);
  return programCertificateEligibilitySchema.parse(r.body).pending?.id ?? '';
}
async function approve(programId: string, certificateTypes: string[]) {
  const id = await propose(programId, certificateTypes);
  await approver.post(`certificate-eligibility/${id}/approve`, { version: 1 }).expect(200);
}
const url = (registrationId: string, sampleId: string, query = 'disposition=inline') =>
  `/api/v1/student/certificate-samples/registrations/${registrationId}/${sampleId}/file?${query}`;
const fetchSample = (
  who: typeof student,
  registrationId: string,
  sampleId: string,
  query?: string,
) =>
  who.agent
    .get(url(registrationId, sampleId, query))
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => {
        chunks.push(c);
      });
      res.on('end', () => {
        done(null, Buffer.concat(chunks));
      });
    });

beforeAll(async () => {
  app = await createTestApp(realConfig({ NODE_ENV: 'test' }));
  admin = await staff(app, ['SUPER_ADMIN']);
  registrar = await staff(app, ['REGISTRAR']);
  approver = await staff(app, ['SUPER_ADMIN']);
  vi.spyOn(app.get(CertificateEligibilityService), 'approvalAuthorityDefinition').mockReturnValue(
    AUTHORITY,
  );
  student = await activatedStudent(app, admin, 'SAMPLE-MULTI');
  single = await activatedStudent(app, admin, 'SAMPLE-ONE');
  other = await activatedStudent(app, admin, 'SAMPLE-OTHER');
  const session = student.master.session.id;
  course.m3 = await program('3M', 3, 'MONTHS');
  course.m24 = await program('24M', 2, 'YEARS');
  course.m36 = await program('36M', 3, 'YEARS');
  course.m18pending = await program('18M-PENDING', 18, 'MONTHS');
  course.m18withdrawn = await program('18M-WITHDRAWN', 18, 'MONTHS');
  course.m18stale = await program('18M-STALE', 18, 'MONTHS');
  course.m12 = await program('12M', 1, 'YEARS');
  course.none = await program('NO-DURATION', null, null);
  await approve(course.m3, ['COURSE_COMPLETION']);
  await approve(course.m24, ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER']);
  await approve(course.m36, ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER', 'MIGRATION']);
  await propose(course.m18pending, ['TRANSCRIPT']);
  const withdrawn = await propose(course.m18withdrawn, ['TRANSCRIPT']);
  await registrar.post(`certificate-eligibility/${withdrawn}/withdraw`, { version: 1 }).expect(200);
  await approve(course.m18stale, ['TRANSCRIPT']);
  // The course duration changed after approval: the approval is now out of date.
  await testDb().program.update({
    where: { id: course.m18stale },
    data: { durationValue: 3, durationUnit: 'YEARS' },
  });
  for (const key of Object.keys(course))
    reg[key] = await register(student.studentId, course[key] ?? '', session);
  reg.single = await register(single.studentId, course.m3, session);
  reg.other = await register(other.studentId, course.m36, session);
});
beforeEach(async () => {
  const hasher = app.get(IdentifierHasher);
  const accounts = await testDb().studentAccount.findMany({
    where: { studentId: { in: [student.studentId, single.studentId, other.studentId] } },
    select: { id: true },
  });
  await app.get(RateLimiter).clear(
    'student-certificate-samples',
    accounts.map((a) => hasher.hash('student-certificate-samples', a.id)),
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

describe('approved course types are served as the pinned synthetic bytes', () => {
  const cases: [string, string, string][] = [
    ['single registration, 3-month course', 'single', 'sample-course-completion-v1'],
    ['24-month course: transcript', 'm24', 'sample-transcript-v1'],
    ['24-month course: provisional', 'm24', 'sample-provisional-v1'],
    ['24-month course: character', 'm24', 'sample-character-v1'],
    ['36-month course: migration', 'm36', 'sample-migration-v1'],
    ['36-month course: transcript', 'm36', 'sample-transcript-v1'],
  ];
  it.each(cases)('%s', async (_label, key, sampleId) => {
    vi.spyOn(app.get(CertificateEligibilityService), 'approvalAuthorityDefinition').mockReturnValue(
      AUTHORITY,
    );
    const who = key === 'single' ? single : student;
    const r = await fetchSample(who, reg[key] ?? '', sampleId).expect(200);
    const pin = ACADEMIC_SAMPLE_PINS[sampleId as keyof typeof ACADEMIC_SAMPLE_PINS];
    expect((r.body as Buffer).length).toBe(pin.bytes);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['content-disposition']).toBe(`inline; filename="${sampleId}.pdf"`);
  });

  it('supports download disposition with the same bytes', async () => {
    const a = await fetchSample(student, reg.m24 ?? '', 'sample-transcript-v1').expect(200);
    const b = await fetchSample(
      student,
      reg.m24 ?? '',
      'sample-transcript-v1',
      'disposition=attachment',
    ).expect(200);
    expect(b.headers['content-disposition']).toBe(
      'attachment; filename="sample-transcript-v1.pdf"',
    );
    expect(Buffer.compare(a.body as Buffer, b.body as Buffer)).toBe(0);
  });
});

describe('everything else is unavailable (404) and nothing is served', () => {
  const cases: [string, string, string][] = [
    ['type not offered by the 24-month course (migration)', 'm24', 'sample-migration-v1'],
    [
      'type not offered by the 24-month course (course completion)',
      'm24',
      'sample-course-completion-v1',
    ],
    ['type not offered by the 3-month course (transcript)', 'm3', 'sample-transcript-v1'],
    ['pending proposal', 'm18pending', 'sample-transcript-v1'],
    ['withdrawn proposal', 'm18withdrawn', 'sample-transcript-v1'],
    ['approval out of date after a duration change', 'm18stale', 'sample-transcript-v1'],
    ['unresolved 12-month duration', 'm12', 'sample-transcript-v1'],
    ['missing duration', 'none', 'sample-course-completion-v1'],
  ];
  it.each(cases)('%s', async (_label, key, sampleId) => {
    const load = vi.spyOn(app.get(AcademicSamplesService), 'load');
    const r = await student.agent.get(url(reg[key] ?? '', sampleId)).expect(404);
    expect(r.headers['content-type']).not.toContain('application/pdf');
    expect(load).not.toHaveBeenCalled();
  });

  it('never serves another student’s registration, unknown registrations or malformed identifiers', async () => {
    const load = vi.spyOn(app.get(AcademicSamplesService), 'load');
    await student.agent.get(url(reg.other ?? '', 'sample-migration-v1')).expect(404);
    await other.agent.get(url(reg.m36 ?? '', 'sample-migration-v1')).expect(404);
    await student.agent.get(url(randomUUID(), 'sample-transcript-v1')).expect(404);
    await student.agent.get(url('not-a-uuid', 'sample-transcript-v1')).expect(404);
    expect(load).not.toHaveBeenCalled();
  });

  it('accepts only academic sample identifiers and no client-supplied type, status or eligibility', async () => {
    for (const sampleId of [
      'sample-training-v1',
      'sample-transcript-v2',
      'TRANSCRIPT',
      '..%2F..%2Fetc',
      'sample-transcript',
    ])
      await student.agent.get(url(reg.m24 ?? '', sampleId)).expect(400);
    for (const query of [
      'certificateType=MIGRATION',
      'typeEligibility=APPROVED_FOR_COURSE',
      'approved=true',
      'registrationId=x',
      'disposition=evil',
    ])
      await student.agent.get(url(reg.m24 ?? '', 'sample-migration-v1', query)).expect(400);
  });

  it('requires a student session; staff sessions and anonymous users are refused', async () => {
    await browser(app)
      .get(url(reg.m24 ?? '', 'sample-transcript-v1'))
      .expect(401);
    await admin
      .get(`student/certificate-samples/registrations/${reg.m24 ?? ''}/sample-transcript-v1/file`)
      .expect(401);
  });
});

describe('integrity, isolation and side effects', () => {
  it('fails closed with a safe 503 and safe diagnostics when a pinned sample fails verification', async () => {
    vi.spyOn(app.get(AcademicSamplesService), 'load').mockImplementation(() => {
      throw new AcademicSampleIntegrityError('sample-transcript-v1', 'sha256');
    });
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const r = await student.agent.get(url(reg.m24 ?? '', 'sample-transcript-v1')).expect(503);
    expect(JSON.stringify(r.body)).toContain('This sample is temporarily unavailable.');
    expect(r.headers['content-type']).not.toContain('application/pdf');
    expect(log).toHaveBeenCalledWith({
      event: 'academic_sample_integrity_failure',
      sampleId: 'sample-transcript-v1',
      check: 'sha256',
    });
  });

  it('keeps the UI-05 training sample independent of course eligibility', async () => {
    // A student whose only courses are unresolved or pending still gets the generic training sample.
    const r = await other.agent
      .get('/api/v1/student/certificate-samples/sample-training-v1/file?disposition=inline')
      .expect(200);
    expect(r.headers['content-type']).toContain('application/pdf');
  });

  it('shares the per-account rate limit with the training sample', async () => {
    for (let i = 0; i < 30; i++)
      await single.agent
        .get('/api/v1/student/certificate-samples/sample-training-v1/file')
        .expect(200);
    const r = await single.agent
      .get(url(reg.single ?? '', 'sample-course-completion-v1'))
      .expect(429);
    expect(r.headers['retry-after']).toBeDefined();
    expect(r.headers['content-type']).not.toContain('application/pdf');
  });

  it('fails closed when the rate limiter is unavailable', async () => {
    vi.spyOn(app.get(RateLimiter), 'hit').mockRejectedValueOnce(Errors.authUnavailable());
    const load = vi.spyOn(app.get(AcademicSamplesService), 'load');
    const r = await student.agent.get(url(reg.m24 ?? '', 'sample-transcript-v1')).expect(503);
    expect(r.headers['content-type']).not.toContain('application/pdf');
    expect(load).not.toHaveBeenCalled();
  });

  it('writes nothing: no certificates, requests, audit entries or object storage', async () => {
    const put = vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'putObject');
    const before = await Promise.all([
      testDb().certificate.count(),
      testDb().certificateRequest.count(),
      testDb().auditLog.count(),
    ]);
    await fetchSample(student, reg.m36 ?? '', 'sample-migration-v1').expect(200);
    await student.agent.get(url(reg.m12 ?? '', 'sample-transcript-v1')).expect(404);
    expect(put).not.toHaveBeenCalled();
    expect(
      await Promise.all([
        testDb().certificate.count(),
        testDb().certificateRequest.count(),
        testDb().auditLog.count(),
      ]),
    ).toEqual(before);
  });
});
