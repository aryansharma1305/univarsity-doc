import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  reExamApplicationDetailSchema,
  reExamApplicationListSchema,
  reExamFeeRuleSchema,
  studentReExamApplicationListSchema,
  studentReExamApplicationSchema,
  studentReExamOptionsSchema,
} from '@docversity/validation';
import { browser, createTestApp, errorOf, realConfig, staff, type Staff } from '../helpers.js';
import {
  type AcademicFixture,
  academicFixture,
  enrolledStudent,
  examination,
  testDb,
} from './support.js';

/**
 * Phase 9B. Every test that depends on the (global) ACTIVE fee rule lives in this file, whose tests
 * run sequentially, so no other test file can change the fee rule underneath them.
 */

type Agent = ReturnType<typeof browser>;

let app: INestApplication;
let admin: Staff;
let registrar: Staff;
let examAdmin: Staff;
let approver: Staff;
let viewer: Staff;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [admin, registrar, examAdmin, approver, viewer] = await Promise.all([
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['REGISTRAR']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['APPROVER']),
    staff(app, ['VIEWER']),
  ]);
});
afterAll(async () => {
  await app.close();
});

/** Activates a new fee rule (retiring whatever was active). */
async function activeRule(
  scope: 'PER_SUBJECT' | 'PER_APPLICATION' | 'PER_EXAMINATION_SESSION',
  rates: string[] = ['1000', '2500'],
  currency = 'INR',
) {
  const created = await admin.post('re-exam-fee-rules', {
    scope,
    currency,
    rates: rates.map((amount, index) => ({ attemptNumber: index + 1, amount })),
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const rule = reExamFeeRuleSchema.parse(created.body);
  return reExamFeeRuleSchema.parse(
    (await admin.post(`re-exam-fee-rules/${rule.id}/activate`).expect(200)).body,
  );
}

async function retireActive() {
  const active = await testDb().reExamFeeRule.findFirst({ where: { status: 'ACTIVE' } });
  if (active) await admin.post(`re-exam-fee-rules/${active.id}/retire`).expect(200);
}

const studentPost = async (agent: Agent, path: string, body: object = {}) => {
  const csrf = (
    (await agent.get('/api/v1/student-auth/csrf').expect(200)).body as { csrfToken: string }
  ).csrfToken;
  return agent.post(`/api/v1/${path}`).set('X-CSRF-Token', csrf).send(body);
};

/** Awaits a request and asserts its status (shows the body on failure). */
async function expectStatus<T extends { status: number; body: unknown }>(
  pending: Promise<T>,
  status: number,
): Promise<T> {
  const response = await pending;
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  return response;
}

async function options(agent: Agent) {
  return studentReExamOptionsSchema.parse(
    (await agent.get('/api/v1/student/re-exam/options').expect(200)).body,
  );
}

async function apply(
  agent: Agent,
  registrationId: string,
  examinationId: string,
  subjectLineId: string,
) {
  return studentPost(agent, 'student/re-exam-applications', {
    registrationId,
    examinationId,
    programSubjectId: subjectLineId,
  });
}

/** The programSubject (curriculum line) id of a fixture subject. */
async function lineOf(fixture: AcademicFixture, subjectId: string) {
  const line = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: fixture.curriculum.id, subjectId },
  });
  return line.id;
}

describe('fee rules (versioned, explicit scope, exact amounts)', () => {
  it('lets only SUPER_ADMIN configure fees, validates amounts/currency and freezes active rules', async () => {
    for (const member of [registrar, examAdmin, approver, viewer]) {
      expect(
        (
          await member.post('re-exam-fee-rules', {
            scope: 'PER_SUBJECT',
            currency: 'INR',
            rates: [{ attemptNumber: 1, amount: '1000' }],
          })
        ).status,
      ).toBe(403);
    }
    // Incorrect currency, fractional paise and missing scope are refused.
    for (const body of [
      { scope: 'PER_SUBJECT', currency: 'XYZ', rates: [{ attemptNumber: 1, amount: '1000' }] },
      { scope: 'PER_SUBJECT', currency: 'INR', rates: [{ attemptNumber: 1, amount: '10.005' }] },
      { scope: 'PER_SUBJECT', currency: 'INR', rates: [{ attemptNumber: 2, amount: '2500' }] },
      { currency: 'INR', rates: [{ attemptNumber: 1, amount: '1000' }] },
      { scope: 'PER_SUBJECT', currency: 'INR', rates: [{ attemptNumber: 1, amount: 1000.5 }] },
    ]) {
      expect((await admin.post('re-exam-fee-rules', body)).status, JSON.stringify(body)).toBe(400);
    }
    const v1 = await activeRule('PER_SUBJECT');
    expect(v1).toMatchObject({
      status: 'ACTIVE',
      scope: 'PER_SUBJECT',
      currency: 'INR',
      attemptBasis: 'NON_REJECTED_RE_EXAM_APPLICATIONS',
      rates: [
        { attemptNumber: 1, amountMinor: 100_000 },
        { attemptNumber: 2, amountMinor: 250_000 },
      ],
    });
    // Active rules and their rates are frozen in the database.
    await expect(
      testDb().reExamFeeRate.update({
        where: { ruleId_attemptNumber: { ruleId: v1.id, attemptNumber: 1 } },
        data: { amountMinor: 1 },
      }),
    ).rejects.toThrow(/frozen/);
    await expect(
      testDb().reExamFeeRule.update({ where: { id: v1.id }, data: { currency: 'USD' } }),
    ).rejects.toThrow(/frozen/);
    await expect(testDb().reExamFeeRule.delete({ where: { id: v1.id } })).rejects.toThrow(
      /cannot be deleted/,
    );
    // A new version retires the previous one.
    const v2 = await activeRule('PER_SUBJECT');
    expect(v2.version).toBe(v1.version + 1);
    const rules = await testDb().reExamFeeRule.findMany({ where: { id: { in: [v1.id, v2.id] } } });
    expect(Object.fromEntries(rules.map((r) => [r.id, r.status]))).toEqual({
      [v1.id]: 'RETIRED',
      [v2.id]: 'ACTIVE',
    });
    const audit = await testDb().auditLog.findMany({ where: { entityId: v1.id } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'RE_EXAM_FEE_RULE_CREATED',
        'RE_EXAM_FEE_RULE_ACTIVATED',
        'RE_EXAM_FEE_RULE_RETIRED',
      ]),
    );
  });
});

describe('student re-exam applications', () => {
  it('prefills verified identity, offers only open re-exams of the own curriculum and snapshots attempt + fee', async () => {
    await activeRule('PER_SUBJECT');
    const fixture = await academicFixture(app, registrar, { structure: 'YEAR_WISE', periods: 2 });
    const student = await enrolledStudent(app, registrar, fixture);
    const reExam = await examination(examAdmin, fixture, {
      kind: 'RE_EXAMINATION',
      period: 2,
      acceptApplications: true,
    });
    // Not offered: a regular exam, a re-exam not accepting applications, another curriculum's re-exam.
    await examination(examAdmin, fixture, { period: 2, open: true });
    await examination(examAdmin, fixture, { kind: 'RE_EXAMINATION', period: 1, open: true });
    const other = await academicFixture(app, registrar);
    const elsewhere = await examination(examAdmin, other, {
      kind: 'RE_EXAMINATION',
      acceptApplications: true,
    });

    const offered = await options(student.agent);
    expect(offered.registrations).toHaveLength(1);
    const [registration] = offered.registrations;
    expect(registration).toMatchObject({
      registrationId: student.registrationId,
      registrationNumber: student.registrationNumber,
      program: { code: fixture.program.code, name: fixture.program.name },
      academicSessionName: expect.any(String) as string,
      structureType: 'YEAR_WISE',
      unavailableReason: null,
    });
    expect(registration?.studentName).toMatch(/^Synthetic Examinee/);
    expect(registration?.examinations.map((e) => e.id)).toEqual([reExam.id]);
    const subjects = registration?.examinations[0]?.subjects ?? [];
    expect(subjects.map((s) => s.code).sort()).toEqual(
      fixture.subjects
        .filter((s) => s.period === 2)
        .map((s) => s.code)
        .sort(),
    );
    expect(subjects[0]).toMatchObject({
      alreadyApplied: false,
      attemptNumber: 1,
      fee: { status: 'ASSESSED', amountMinor: 100_000, currency: 'INR', scope: 'PER_SUBJECT' },
    });

    const subject = fixture.subjects.find((s) => s.period === 2);
    if (!subject) throw new Error('no subject');
    const line = await lineOf(fixture, subject.id);
    // The client can never send identity, attempt, price or paid status.
    const tampered = await studentPost(student.agent, 'student/re-exam-applications', {
      registrationId: student.registrationId,
      examinationId: reExam.id,
      programSubjectId: line,
      attemptNumber: 1,
      feeAmountMinor: 1,
      paid: true,
    });
    expect(tampered.status).toBe(400);
    // Wrong examination / subject outside the period are refused.
    expect((await apply(student.agent, student.registrationId, elsewhere.id, line)).status).toBe(
      400,
    );
    const periodOne = fixture.subjects.find((s) => s.period === 1);
    if (!periodOne) throw new Error('no subject');
    expect(
      (
        await apply(
          student.agent,
          student.registrationId,
          reExam.id,
          await lineOf(fixture, periodOne.id),
        )
      ).status,
    ).toBe(400);

    const created = await apply(student.agent, student.registrationId, reExam.id, line);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const application = studentReExamApplicationSchema.parse(created.body);
    expect(application).toMatchObject({
      status: 'SUBMITTED',
      registrationNumber: student.registrationNumber,
      programName: fixture.program.name,
      periodLabel: 'Year 2',
      subject: { code: subject.code },
      attemptNumber: 1,
      fee: { status: 'ASSESSED', amountMinor: 100_000, currency: 'INR', scope: 'PER_SUBJECT' },
    });
    expect(application.reference).toMatch(/^RX-[0-9A-F]{4}-[0-9A-F]{4}$/);
    // Duplicate (same registration, examination, subject) is refused.
    const duplicate = await apply(student.agent, student.registrationId, reExam.id, line);
    expect(duplicate.status).toBe(409);
    expect(
      (await options(student.agent)).registrations[0]?.examinations[0]?.subjects.find(
        (s) => s.code === subject.code,
      )?.alreadyApplied,
    ).toBe(true);
    // Identity snapshots are immutable in the database.
    await expect(
      testDb().reExamApplication.update({
        where: { id: application.id },
        data: { attemptNumber: 5 },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      testDb().reExamApplication.delete({ where: { id: application.id } }),
    ).rejects.toThrow(/cannot be deleted/);
  });

  it('derives attempts from recorded history: INR 1,000 then INR 2,500, no invented third fee, rejected attempts not counted', async () => {
    await activeRule('PER_SUBJECT');
    const fixture = await academicFixture(app, registrar, { periods: 1 });
    const student = await enrolledStudent(app, registrar, fixture);
    const subject = fixture.subjects[0];
    if (!subject) throw new Error('no subject');
    const line = await lineOf(fixture, subject.id);
    const sessions = await Promise.all(
      [1, 2, 3, 4].map(() =>
        examination(examAdmin, fixture, { kind: 'RE_EXAMINATION', acceptApplications: true }),
      ),
    );
    const submit = async (examId: string) =>
      studentReExamApplicationSchema.parse(
        (await expectStatus(apply(student.agent, student.registrationId, examId, line), 201)).body,
      );

    const first = await submit(sessions[0]?.id ?? '');
    expect([first.attemptNumber, first.fee.amountMinor]).toEqual([1, 100_000]);
    await examAdmin.post(`re-exam-applications/${first.id}/approve`, {}).expect(200);
    const second = await submit(sessions[1]?.id ?? '');
    expect([second.attemptNumber, second.fee.amountMinor, second.fee.currency]).toEqual([
      2,
      250_000,
      'INR',
    ]);
    const third = await submit(sessions[2]?.id ?? '');
    expect(third.attemptNumber).toBe(3);
    expect(third.fee).toMatchObject({
      status: 'NOT_CONFIGURED',
      blockedReason: 'NO_RATE_FOR_ATTEMPT',
      amountMinor: null,
    });
    const rule = await testDb().reExamFeeRule.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    // NULL comparisons must not bypass the database's all-or-nothing assessed-fee check.
    for (const missing of ['feeCurrency', 'feeAmountMinor'] as const) {
      await expect(
        testDb().reExamApplication.update({
          where: { id: third.id },
          data: {
            feeStatus: 'ASSESSED',
            feeBlockedReason: null,
            feeRuleId: rule.id,
            feeRuleVersion: rule.version,
            feeScope: rule.scope,
            feeCurrency: 'INR',
            feeAmountMinor: 100_000,
            feeAssessedAt: new Date(),
            [missing]: null,
          },
        }),
      ).rejects.toThrow(/re_exam_applications_assessed_values_required_check/);
    }
    // A rejected application does not count: the next one is attempt 3 again.
    await examAdmin
      .post(`re-exam-applications/${third.id}/reject`, { reason: 'Synthetic: duplicate request' })
      .expect(200);
    const again = await submit(sessions[3]?.id ?? '');
    expect(again.attemptNumber).toBe(3);
  });

  it('serialises simultaneous applications so attempts and duplicate submissions stay authoritative', async () => {
    await activeRule('PER_SUBJECT');
    const fixture = await academicFixture(app, registrar, { periods: 1 });
    const student = await enrolledStudent(app, registrar, fixture);
    const subject = fixture.subjects[0];
    if (!subject) throw new Error('no subject');
    const line = await lineOf(fixture, subject.id);
    const sessions = await Promise.all(
      [1, 2, 3].map(() =>
        examination(examAdmin, fixture, { kind: 'RE_EXAMINATION', acceptApplications: true }),
      ),
    );
    const [first, second, duplicateSession] = sessions;
    if (!first || !second || !duplicateSession) throw new Error('missing examination');
    const parallel = await Promise.all([
      apply(student.agent, student.registrationId, first.id, line),
      apply(student.agent, student.registrationId, second.id, line),
    ]);
    const applications = parallel
      .map((response) => {
        expect(response.status, JSON.stringify(response.body)).toBe(201);
        return studentReExamApplicationSchema.parse(response.body);
      })
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
    expect(applications.map((record) => [record.attemptNumber, record.fee.amountMinor])).toEqual([
      [1, 100_000],
      [2, 250_000],
    ]);
    const duplicates = await Promise.all([
      apply(student.agent, student.registrationId, duplicateSession.id, line),
      apply(student.agent, student.registrationId, duplicateSession.id, line),
    ]);
    expect(duplicates.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      await testDb().reExamApplication.count({
        where: { studentRegistrationId: student.registrationId, subjectId: subject.id },
      }),
    ).toBe(3);
    const winner = duplicates.find((response) => response.status === 201);
    expect(studentReExamApplicationSchema.parse(winner?.body)).toMatchObject({
      attemptNumber: 3,
      fee: { status: 'NOT_CONFIGURED', blockedReason: 'NO_RATE_FOR_ATTEMPT' },
    });
  });

  it('blocks payment-relevant fees until configured, never re-prices existing applications, and refuses undefined scopes', async () => {
    await retireActive();
    const fixture = await academicFixture(app, registrar, { periods: 1 });
    const student = await enrolledStudent(app, registrar, fixture);
    const subjects = await Promise.all(fixture.subjects.map((s) => lineOf(fixture, s.id)));
    const reExam = await examination(examAdmin, fixture, {
      kind: 'RE_EXAMINATION',
      acceptApplications: true,
    });

    const unconfigured = studentReExamApplicationSchema.parse(
      (
        await expectStatus(
          apply(student.agent, student.registrationId, reExam.id, subjects[0] ?? ''),
          201,
        )
      ).body,
    );
    expect(unconfigured.fee).toMatchObject({
      status: 'NOT_CONFIGURED',
      blockedReason: 'NO_ACTIVE_RULE',
    });

    // Per-session scope is not defined well enough to price one subject: refused, not guessed.
    await activeRule('PER_EXAMINATION_SESSION');
    const recheckSession = studentReExamApplicationSchema.parse(
      (
        await expectStatus(
          studentPost(student.agent, `student/re-exam-applications/${unconfigured.id}/fee`),
          200,
        )
      ).body,
    );
    expect(recheckSession.fee).toMatchObject({
      status: 'NOT_CONFIGURED',
      blockedReason: 'SCOPE_NOT_SUPPORTED',
    });

    // Once a supported rule exists, the student can re-check; the attempt number never changes.
    const v = await activeRule('PER_APPLICATION', ['1000', '2500']);
    const assessed = studentReExamApplicationSchema.parse(
      (
        await expectStatus(
          studentPost(student.agent, `student/re-exam-applications/${unconfigured.id}/fee`),
          200,
        )
      ).body,
    );
    expect(assessed.fee).toMatchObject({
      status: 'ASSESSED',
      amountMinor: 100_000,
      scope: 'PER_APPLICATION',
      ruleVersion: v.version,
    });
    expect(assessed.attemptNumber).toBe(1);

    // A later policy change does not silently alter existing applications.
    await activeRule('PER_SUBJECT', ['1200', '3000']);
    const unchanged = studentReExamApplicationSchema.parse(
      (
        await expectStatus(
          studentPost(student.agent, `student/re-exam-applications/${unconfigured.id}/fee`),
          200,
        )
      ).body,
    );
    expect(unchanged.fee).toMatchObject({ amountMinor: 100_000, ruleVersion: v.version });
    await expect(
      testDb().reExamApplication.update({
        where: { id: unconfigured.id },
        data: { feeAmountMinor: 1 },
      }),
    ).rejects.toThrow(/fixed once assessed/);
    await activeRule('PER_SUBJECT'); // leave the confirmed schedule active for later tests
  });

  it('isolates students, honours unassigned registrations and lets students cancel only undecided applications', async () => {
    await activeRule('PER_SUBJECT');
    const fixture = await academicFixture(app, registrar, { periods: 1 });
    const owner = await enrolledStudent(app, registrar, fixture);
    const intruder = await enrolledStudent(app, registrar, fixture);
    const unassigned = await enrolledStudent(app, registrar, fixture, { assign: false });
    const reExam = await examination(examAdmin, fixture, {
      kind: 'RE_EXAMINATION',
      acceptApplications: true,
    });
    const line = await lineOf(fixture, fixture.subjects[0]?.id ?? '');

    // Applying with someone else's registration is "not found".
    expect((await apply(intruder.agent, owner.registrationId, reExam.id, line)).status).toBe(404);
    const created = studentReExamApplicationSchema.parse(
      (await expectStatus(apply(owner.agent, owner.registrationId, reExam.id, line), 201)).body,
    );
    expect(
      (await intruder.agent.get(`/api/v1/student/re-exam-applications/${created.id}`)).status,
    ).toBe(404);
    expect(
      (await studentPost(intruder.agent, `student/re-exam-applications/${created.id}/cancel`))
        .status,
    ).toBe(404);
    expect(
      studentReExamApplicationListSchema.parse(
        (await intruder.agent.get('/api/v1/student/re-exam-applications').expect(200)).body,
      ).data,
    ).toEqual([]);
    expect((await browser(app).get('/api/v1/student/re-exam/options')).status).toBe(401);

    // No syllabus assigned → honest unavailable state, and submission is refused.
    const none = await options(unassigned.agent);
    expect(none.registrations[0]).toMatchObject({
      examinations: [],
      unavailableReason: expect.stringMatching(/No syllabus/) as string,
    });
    expect((await apply(unassigned.agent, unassigned.registrationId, reExam.id, line)).status).toBe(
      409,
    );

    const cancelled = studentReExamApplicationSchema.parse(
      (
        await expectStatus(
          studentPost(owner.agent, `student/re-exam-applications/${created.id}/cancel`),
          200,
        )
      ).body,
    );
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.history.map((h) => h.summary)).toEqual([
      'You submitted the application',
      'You cancelled the application',
    ]);
    // A cancelled application frees the slot (re-apply allowed) but can't be cancelled again.
    expect(
      (await studentPost(owner.agent, `student/re-exam-applications/${created.id}/cancel`)).status,
    ).toBe(409);
    expect((await apply(owner.agent, owner.registrationId, reExam.id, line)).status).toBe(201);
  });
});

describe('staff management', () => {
  it('separates reading from deciding, records reasons, and lets only one concurrent decision win', async () => {
    await activeRule('PER_SUBJECT');
    const fixture = await academicFixture(app, registrar, { periods: 1, subjectsPerPeriod: 2 });
    const student = await enrolledStudent(app, registrar, fixture);
    const reExam = await examination(examAdmin, fixture, {
      kind: 'RE_EXAMINATION',
      acceptApplications: true,
    });
    const [lineA, lineB] = await Promise.all(fixture.subjects.map((s) => lineOf(fixture, s.id)));
    const a = studentReExamApplicationSchema.parse(
      (
        await expectStatus(
          apply(student.agent, student.registrationId, reExam.id, lineA ?? ''),
          201,
        )
      ).body,
    );
    const b = studentReExamApplicationSchema.parse(
      (
        await expectStatus(
          apply(student.agent, student.registrationId, reExam.id, lineB ?? ''),
          201,
        )
      ).body,
    );

    expect((await viewer.get('re-exam-applications')).status).toBe(403);
    for (const member of [registrar, approver]) {
      await member.get(`re-exam-applications/${a.id}`).expect(200);
      expect((await member.post(`re-exam-applications/${a.id}/approve`, {})).status).toBe(403);
    }
    // Search by registration number and filter by program/period/status.
    const list = reExamApplicationListSchema.parse(
      (
        await registrar
          .get(
            `re-exam-applications?search=${student.registrationNumber}&programId=${fixture.program.id}&periodNumber=1&status=SUBMITTED`,
          )
          .expect(200)
      ).body,
    );
    expect(list.data.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());

    expect(
      (await examAdmin.post(`re-exam-applications/${a.id}/reject`, { reason: 'x' })).status,
    ).toBe(400);
    // Concurrent conflicting decisions: exactly one wins.
    const results = await Promise.all([
      examAdmin.post(`re-exam-applications/${a.id}/approve`, {}),
      examAdmin.post(`re-exam-applications/${a.id}/reject`, {
        reason: 'Synthetic conflicting decision',
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await examAdmin.post(`re-exam-applications/${a.id}/approve`, {})).status).toBe(409);

    await examAdmin
      .post(`re-exam-applications/${b.id}/reject`, { reason: 'Synthetic: subject was passed' })
      .expect(200);
    const detail = reExamApplicationDetailSchema.parse(
      (await registrar.get(`re-exam-applications/${b.id}`).expect(200)).body,
    );
    expect(detail).toMatchObject({
      status: 'REJECTED',
      decisionReason: 'Synthetic: subject was passed',
      attemptNumber: 1,
    });
    expect(detail.history.map((h) => h.action)).toEqual([
      'RE_EXAM_APPLICATION_SUBMITTED',
      'RE_EXAM_APPLICATION_REJECTED',
    ]);
    // The student sees the decision and its reason.
    const own = studentReExamApplicationSchema.parse(
      (await student.agent.get(`/api/v1/student/re-exam-applications/${b.id}`).expect(200)).body,
    );
    expect(own).toMatchObject({
      status: 'REJECTED',
      decisionReason: 'Synthetic: subject was passed',
    });
    expect(own.history.at(-1)?.summary).toBe('Rejected by the university');
    // The reason is not copied into the audit log.
    const audit = await testDb().auditLog.findMany({ where: { entityId: b.id } });
    expect(JSON.stringify(audit)).not.toContain('subject was passed');
  });

  it('exports permitted fields as spreadsheet-safe CSV and audits the export without personal search text', async () => {
    await activeRule('PER_SUBJECT');
    const fixture = await academicFixture(app, registrar, { periods: 1 });
    const student = await enrolledStudent(app, registrar, fixture);
    await testDb().student.update({
      where: { id: student.studentId },
      data: { fullName: '=HYPERLINK("http://evil.example")' },
    });
    const reExam = await examination(examAdmin, fixture, {
      kind: 'RE_EXAMINATION',
      acceptApplications: true,
    });
    await expectStatus(
      apply(
        student.agent,
        student.registrationId,
        reExam.id,
        await lineOf(fixture, fixture.subjects[0]?.id ?? ''),
      ),
      201,
    );

    expect((await viewer.get('re-exam-applications/export')).status).toBe(403);
    const response = await registrar
      .get(`re-exam-applications/export?examinationId=${reExam.id}&search=HYPERLINK`)
      .expect(200);
    expect(response.headers['content-type']).toMatch(/^text\/csv/);
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="re-exam-applications-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const lines = response.text.trim().split('\r\n');
    expect(lines[0]).toMatch(/^Reference,Submitted at,Status,Student name,Registration number/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(lines[1]).toContain('₹1,000.00');
    const exportAudit = await testDb().auditLog.findFirst({
      where: { action: 'RE_EXAM_APPLICATIONS_EXPORTED', actorUserId: registrar.user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(exportAudit?.metadata)).not.toContain('HYPERLINK');
    expect(exportAudit?.metadata).toMatchObject({
      rows: 1,
      filters: { search: true, examinationId: reExam.id },
    });
    const forbidden = await approver.post('re-exam-applications/export', {});
    expect([404, 405]).toContain(forbidden.status);
    expect(errorOf(forbidden).code).toBeDefined();
  });
});
