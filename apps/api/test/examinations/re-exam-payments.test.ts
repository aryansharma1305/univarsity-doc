import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type PaymentRegion,
  paymentDestinationDetailSchema,
  paymentDestinationListSchema,
  reExamApplicationDetailSchema,
  reExamPaymentDetailSchema,
  reExamPaymentListSchema,
  studentReExamApplicationSchema,
  studentReExamPaymentViewSchema,
} from '@docversity/validation';
import { browser, createTestApp, errorOf, realConfig, staff, type Staff } from '../helpers.js';
import { pdfWithCompressedScript, staticPdf } from '../historical-documents/support.js';
import {
  type AcademicFixture,
  academicFixture,
  enrolledStudent,
  examination,
  testDb,
} from './support.js';

/**
 * Phase 9C. Payment destinations are global per region, so every destination test lives in this
 * file (tests run sequentially). Applications are inserted with a fee snapshot that references a fee
 * rule created (and retired) only for this file, so the 9B tests' ACTIVE rule never interferes.
 * All QR images, beneficiaries and references are synthetic.
 */

type Agent = ReturnType<typeof browser>;
type Student = Awaited<ReturnType<typeof enrolledStudent>> & { accountId: string };

let app: INestApplication;
let maker: Staff;
let checker: Staff;
let registrar: Staff;
let examAdmin: Staff;
let approver: Staff;
let approver2: Staff;
let viewer: Staff;
let fixture: AcademicFixture;
let reExamId: string;
let feeRule: { id: string; version: number };
let subjectCursor = 0;

const sha = (bytes: Buffer | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** A synthetic "QR" picture (clearly labelled test data — no payment details). */
function testQr(label: string, size = 320): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="20" y="20" width="80" height="80" fill="#000"/>
    <rect x="${String(size - 100)}" y="20" width="80" height="80" fill="#000"/>
    <rect x="20" y="${String(size - 100)}" width="80" height="80" fill="#000"/>
    <text x="30" y="${String(size / 2)}" font-family="sans-serif" font-size="18" fill="#000">TEST ${label} NOT PAYABLE</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const receiptPng = () =>
  sharp({ create: { width: 400, height: 700, channels: 3, background: '#f2f2f2' } })
    .png()
    .toBuffer();

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [maker, checker, registrar, examAdmin, approver, approver2, viewer] = await Promise.all([
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['REGISTRAR']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['APPROVER']),
    staff(app, ['APPROVER']),
    staff(app, ['VIEWER']),
  ]);
  fixture = await academicFixture(app, registrar, { periods: 1, subjectsPerPeriod: 12 });
  reExamId = (
    await examination(examAdmin, fixture, {
      kind: 'RE_EXAMINATION',
      period: 1,
      acceptApplications: true,
    })
  ).id;
  // A fee rule only for this file: INR 1,000 / 2,500, retired straight away (never ACTIVE).
  feeRule = await testDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('re_exam_fee_rules_version'))`;
    const last = await tx.reExamFeeRule.aggregate({ _max: { version: true } });
    const rule = await tx.reExamFeeRule.create({
      data: {
        version: (last._max.version ?? 0) + 1,
        scope: 'PER_SUBJECT',
        currency: 'INR',
        attemptBasis: 'NON_REJECTED_RE_EXAM_APPLICATIONS',
        createdByUserId: maker.user.id,
        rates: {
          create: [
            { attemptNumber: 1, amountMinor: 100_000 },
            { attemptNumber: 2, amountMinor: 250_000 },
          ],
        },
      },
    });
    await tx.reExamFeeRule.update({
      where: { id: rule.id },
      data: { status: 'RETIRED', retiredAt: new Date(), retiredByUserId: maker.user.id },
    });
    return { id: rule.id, version: rule.version };
  });
}, 120_000);

afterAll(async () => {
  await app.close();
});

async function newStudent(): Promise<Student> {
  const s = await enrolledStudent(app, registrar, fixture);
  const account = await testDb().studentAccount.findUniqueOrThrow({
    where: { studentId: s.studentId },
  });
  return { ...s, accountId: account.id };
}

/** An application with an assessed fee snapshot (attempt 1 → INR 1,000; attempt 2 → INR 2,500). */
async function assessedApplication(student: Student, attempt = 1) {
  const subject = fixture.subjects[subjectCursor++ % fixture.subjects.length];
  if (!subject) throw new Error('no subject');
  const line = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: fixture.curriculum.id, subjectId: subject.id },
  });
  const created = await testDb().reExamApplication.create({
    data: {
      studentId: student.studentId,
      studentRegistrationId: student.registrationId,
      examinationId: reExamId,
      programSubjectId: line.id,
      subjectId: subject.id,
      attemptNumber: attempt,
      attemptBasis: 'NON_REJECTED_RE_EXAM_APPLICATIONS',
      studentName: 'Synthetic Payer',
      registrationNumber: student.registrationNumber,
      programCode: fixture.program.code,
      programName: fixture.program.name,
      academicSessionName: `Synthetic batch ${fixture.master.session.code}`,
      periodLabel: 'Semester 1',
      subjectCode: subject.code,
      subjectName: subject.name,
      examinationName: 'Synthetic Re-examination',
      examSession: 'Synthetic May–June 2026',
      submittedByAccountId: student.accountId,
      feeStatus: 'ASSESSED',
      feeRuleId: feeRule.id,
      feeRuleVersion: feeRule.version,
      feeScope: 'PER_SUBJECT',
      feeCurrency: 'INR',
      feeAmountMinor: attempt === 1 ? 100_000 : 250_000,
      feeAssessedAt: new Date(),
    },
  });
  return created.id;
}

const studentCsrf = async (agent: Agent) =>
  ((await agent.get('/api/v1/student-auth/csrf').expect(200)).body as { csrfToken: string })
    .csrfToken;

async function studentPost(agent: Agent, path: string, body: object = {}) {
  // Fetch the token first: a supertest request must be sent right after it is created.
  const csrf = await studentCsrf(agent);
  return agent.post(`/api/v1/${path}`).set('X-CSRF-Token', csrf).send(body);
}

async function view(agent: Agent, applicationId: string) {
  const response = await agent.get(`/api/v1/student/re-exam-applications/${applicationId}/payment`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return studentReExamPaymentViewSchema.parse(response.body);
}

async function start(agent: Agent, applicationId: string, region: PaymentRegion) {
  return studentPost(agent, `student/re-exam-applications/${applicationId}/payment`, { region });
}

async function submit(
  agent: Agent,
  paymentId: string,
  reference: string,
  file?: { bytes: Buffer; type: string; name: string },
  extra: Record<string, string> = {},
) {
  const csrf = await studentCsrf(agent);
  let req = agent
    .post(`/api/v1/student/re-exam-payments/${paymentId}/submit`)
    .set('X-CSRF-Token', csrf)
    .field('transactionReference', reference);
  for (const [key, value] of Object.entries(extra)) req = req.field(key, value);
  if (file)
    req = req.attach('evidence', file.bytes, { filename: file.name, contentType: file.type });
  return req;
}

async function expectStatus<T extends { status: number; body: unknown }>(
  pending: Promise<T> | T,
  status: number,
): Promise<T> {
  const response = await pending;
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  return response;
}

const draftBody = (region: PaymentRegion, overrides: Record<string, unknown> = {}) => ({
  region,
  beneficiaryName: `Synthetic University Fees Account (${region})`,
  method: 'UPI',
  currency: 'INR',
  instructions: 'TEST ONLY: scan the synthetic QR in your payment app and keep the confirmation.',
  evidenceRequirement: 'OPTIONAL',
  effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
  ...overrides,
});

function uploadQr(member: Staff, id: string, bytes: Buffer, type = 'image/png') {
  return member.agent
    .post(`/api/v1/re-exam-payment-destinations/${id}/qr`)
    .set('X-CSRF-Token', member.csrf)
    .attach('file', bytes, { filename: 'qr.png', contentType: type });
}

/** Publishes (or replaces) the approved destination of a region: maker drafts, checker approves. */
async function publish(region: PaymentRegion, overrides: Record<string, unknown> = {}) {
  const current = await testDb().reExamPaymentDestination.findFirst({
    where: { region, status: 'APPROVED' },
  });
  const created = await expectStatus(
    maker.post('re-exam-payment-destinations', {
      ...draftBody(region, overrides),
      ...(current ? { replacesDestinationId: current.id } : {}),
    }),
    201,
  );
  const draft = paymentDestinationDetailSchema.parse(created.body);
  await expectStatus(uploadQr(maker, draft.id, await testQr(region)), 200);
  const approved = await expectStatus(
    checker.post(`re-exam-payment-destinations/${draft.id}/approve`, { confirmApproved: true }),
    200,
  );
  return paymentDestinationDetailSchema.parse(approved.body);
}

async function retireRegion(region: PaymentRegion) {
  const current = await testDb().reExamPaymentDestination.findFirst({
    where: { region, status: 'APPROVED' },
  });
  if (current)
    await expectStatus(maker.post(`re-exam-payment-destinations/${current.id}/retire`), 200);
}

describe('permissions', () => {
  it('separates payment configuration, payment review and academic decisions', async () => {
    for (const member of [registrar, examAdmin, approver, viewer]) {
      expect((await member.get('re-exam-payment-destinations')).status).toBe(403);
      expect((await member.post('re-exam-payment-destinations', draftBody('INDIA'))).status).toBe(
        403,
      );
    }
    for (const member of [registrar, examAdmin, viewer]) {
      expect((await member.get('re-exam-payments')).status).toBe(403);
    }
    expect((await approver.get('re-exam-payments')).status).toBe(200);
    expect((await maker.get('re-exam-payments')).status).toBe(200);
    // No one is signed in: 401, and a student session is not a staff session.
    expect((await browser(app).get('/api/v1/re-exam-payments')).status).toBe(401);
  });
});

describe('payment destinations', () => {
  it('validates drafts, needs a QR and a second person to approve, and freezes approved versions', async () => {
    for (const body of [
      draftBody('INDIA', { countryName: 'India' }), // a country only for region groups
      draftBody('INDIA', { currency: 'XYZ' }),
      draftBody('INDIA', { instructions: 'short' }),
      draftBody('INDIA', {
        effectiveFrom: '2026-12-01T00:00:00Z',
        effectiveUntil: '2026-11-01T00:00:00Z',
      }),
      draftBody('NEPAL', { currency: 'NPR', rates: [{ attemptNumber: 2, amount: '1600' }] }),
      draftBody('NEPAL', { currency: 'NPR', rates: [{ attemptNumber: 1, amount: 1600.5 }] }),
      draftBody('BHUTAN' as PaymentRegion),
    ]) {
      expect(
        (await maker.post('re-exam-payment-destinations', body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    const draft = paymentDestinationDetailSchema.parse(
      (await expectStatus(maker.post('re-exam-payment-destinations', draftBody('INDIA')), 201))
        .body,
    );
    expect(draft).toMatchObject({ status: 'DRAFT', state: 'DRAFT', version: 1, qr: null });

    // No QR yet.
    expect(
      errorOf(
        await expectStatus(
          checker.post(`re-exam-payment-destinations/${draft.id}/approve`, {
            confirmApproved: true,
          }),
          409,
        ),
      ).message,
    ).toMatch(/QR/);
    // QR: a PDF, an executable disguised as PNG, a tiny image are refused.
    await expectStatus(uploadQr(maker, draft.id, staticPdf(), 'application/pdf'), 400);
    await expectStatus(
      uploadQr(maker, draft.id, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)])),
      400,
    );
    await expectStatus(uploadQr(maker, draft.id, await testQr('TINY', 60)), 400);
    const original = await testQr('INDIA');
    const withQr = paymentDestinationDetailSchema.parse(
      (await expectStatus(uploadQr(maker, draft.id, original), 200)).body,
    );
    expect(withQr.qr?.contentType).toBe('image/png');
    // Stored re-encoded (not the uploaded bytes).
    expect(withQr.qr?.sha256).not.toBe(sha(original));

    // Confirmation is required, and the preparer cannot approve their own details.
    await expectStatus(checker.post(`re-exam-payment-destinations/${draft.id}/approve`, {}), 400);
    expect(
      errorOf(
        await expectStatus(
          maker.post(`re-exam-payment-destinations/${draft.id}/approve`, { confirmApproved: true }),
          409,
        ),
      ).message,
    ).toMatch(/different/);
    const approved = paymentDestinationDetailSchema.parse(
      (
        await expectStatus(
          checker.post(`re-exam-payment-destinations/${draft.id}/approve`, {
            confirmApproved: true,
          }),
          200,
        )
      ).body,
    );
    expect(approved).toMatchObject({ status: 'APPROVED', state: 'AVAILABLE', isActive: true });
    expect(approved.history.map((h) => h.action)).toEqual([
      'RE_EXAM_PAYMENT_DESTINATION_CREATED',
      'RE_EXAM_PAYMENT_DESTINATION_QR_UPLOADED',
      'RE_EXAM_PAYMENT_DESTINATION_APPROVED',
    ]);

    // Frozen: the API refuses edits; the database refuses them too, and deletion.
    await expectStatus(
      maker.patch(`re-exam-payment-destinations/${draft.id}`, { beneficiaryName: 'Changed name' }),
      409,
    );
    await expectStatus(uploadQr(maker, draft.id, original), 409);
    await expect(
      testDb().reExamPaymentDestination.update({
        where: { id: draft.id },
        data: { beneficiaryName: 'Changed name' },
      }),
    ).rejects.toThrow(/frozen/);
    await expect(
      testDb().reExamPaymentDestination.delete({ where: { id: draft.id } }),
    ).rejects.toThrow(/cannot be deleted/);

    // A second approved version of the same region needs to be a replacement.
    const second = paymentDestinationDetailSchema.parse(
      (await expectStatus(maker.post('re-exam-payment-destinations', draftBody('INDIA')), 201))
        .body,
    );
    await expectStatus(uploadQr(maker, second.id, await testQr('INDIA-2')), 200);
    await expectStatus(
      checker.post(`re-exam-payment-destinations/${second.id}/approve`, { confirmApproved: true }),
      409,
    );
    await expectStatus(maker.post(`re-exam-payment-destinations/${second.id}/retire`), 200);

    const list = paymentDestinationListSchema.parse(
      (await expectStatus(maker.get('re-exam-payment-destinations'), 200)).body,
    );
    expect(list.regions.map((r) => r.label)).toEqual([
      'India',
      'Nepal',
      'Bangladesh',
      'Pakistan',
      'Afghanistan',
      'Europe',
      'Central Asia',
      'Others',
    ]);
    expect(list.regions.find((r) => r.region === 'INDIA')?.approved?.id).toBe(draft.id);
    expect(list.regions.filter((r) => r.isGroup).map((r) => r.region)).toEqual([
      'EUROPE',
      'CENTRAL_ASIA',
      'OTHERS',
    ]);
  });

  it('accepts a specific country for region groups only', async () => {
    const europe = await publish('EUROPE', {
      countryName: 'Synthetic SEPA countries',
      currency: 'EUR',
      method: 'BANK_TRANSFER',
      rates: [{ attemptNumber: 1, amount: '12.50' }],
    });
    expect(europe).toMatchObject({
      countryName: 'Synthetic SEPA countries',
      currency: 'EUR',
      rates: [{ attemptNumber: 1, amountMinor: 1250 }],
    });
  });
});

describe('student Pay Now', () => {
  it('offers all eight choices honestly, snapshots the amount and serves only the chosen QR', async () => {
    await publish('NEPAL', { currency: 'NPR', rates: [{ attemptNumber: 1, amount: '1600' }] });
    const student = await newStudent();
    const applicationId = await assessedApplication(student);
    const initial = await view(student.agent, applicationId);
    expect(initial.application.reference).toMatch(/^RX-/);
    expect(initial.application).toMatchObject({
      studentName: 'Synthetic Payer',
      registrationNumber: student.registrationNumber,
      attemptNumber: 1,
    });
    expect(initial.unavailableReason).toBeNull();
    expect(initial.current).toBeNull();
    expect(Object.fromEntries(initial.regions.map((r) => [r.region, r.unavailableReason]))).toEqual(
      {
        INDIA: null,
        NEPAL: null,
        BANGLADESH: 'NOT_CONFIGURED',
        PAKISTAN: 'NOT_CONFIGURED',
        AFGHANISTAN: 'NOT_CONFIGURED',
        EUROPE: null,
        CENTRAL_ASIA: 'NOT_CONFIGURED',
        OTHERS: 'NOT_CONFIGURED',
      },
    );

    // Unconfigured choices are refused — no fallback destination.
    for (const region of [
      'BANGLADESH',
      'PAKISTAN',
      'AFGHANISTAN',
      'CENTRAL_ASIA',
      'OTHERS',
    ] as const) {
      expect(
        errorOf(await expectStatus(start(student.agent, applicationId, region), 409)).message,
      ).toMatch(/not published payment details/);
    }
    // The student never chooses the amount or attempt.
    await expectStatus(
      studentPost(student.agent, `student/re-exam-applications/${applicationId}/payment`, {
        region: 'INDIA',
        amountMinor: 1,
      }),
      400,
    );

    const india = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    expect(india.current).toMatchObject({
      status: 'AWAITING_PAYMENT',
      region: 'INDIA',
      amountMinor: 100_000,
      currency: 'INR',
    });
    const paymentId = india.current?.id ?? '';
    const stored = await testDb().reExamPayment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(stored).toMatchObject({ amountSource: 'FEE_RULE', feeRuleVersion: feeRule.version });
    // Choosing the same region again is idempotent.
    const again = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    expect(again.current?.id).toBe(paymentId);

    // The QR served is exactly the chosen destination's.
    const qr = await expectStatus(
      student.agent.get(`/api/v1/student/re-exam-payments/${paymentId}/qr`).buffer(true),
      200,
    );
    const destination = await testDb().reExamPaymentDestination.findUniqueOrThrow({
      where: { id: stored.destinationId },
    });
    expect(destination.region).toBe('INDIA');
    expect(sha(qr.body as Buffer)).toBe(destination.qrSha256);
    expect(qr.headers['cache-control']).toBe('private, no-store');
    expect(qr.headers['content-type']).toMatch(/^image\/png/);

    // Switching to Nepal replaces the unpaid obligation with Nepal's approved NPR amount.
    const nepal = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'NEPAL'), 200)).body,
    );
    expect(nepal.current).toMatchObject({ region: 'NEPAL', amountMinor: 160_000, currency: 'NPR' });
    expect(nepal.previous).toEqual([
      expect.objectContaining({ id: paymentId, status: 'VOID', region: 'INDIA' }),
    ]);
    // The replaced obligation's QR is no longer served.
    await expectStatus(student.agent.get(`/api/v1/student/re-exam-payments/${paymentId}/qr`), 404);

    // Another student sees nothing of it.
    const other = await newStudent();
    await expectStatus(
      other.agent.get(`/api/v1/student/re-exam-applications/${applicationId}/payment`),
      404,
    );
    await expectStatus(start(other.agent, applicationId, 'INDIA'), 404);
    await expectStatus(
      other.agent.get(`/api/v1/student/re-exam-payments/${nepal.current?.id ?? ''}/qr`),
      404,
    );
    await expectStatus(submit(other.agent, nepal.current?.id ?? '', 'UTR-OTHER-0001'), 404);
    // Staff sessions are not student sessions.
    expect(
      (await maker.agent.get(`/api/v1/student/re-exam-applications/${applicationId}/payment`))
        .status,
    ).toBe(401);
  });

  it('refuses a currency without an approved amount for the attempt and unassessed fees', async () => {
    const student = await newStudent();
    const second = await assessedApplication(student, 2);
    const v = await view(student.agent, second);
    // Nepal only approved attempt 1 in NPR; Europe only attempt 1 in EUR; INR comes from the fee.
    expect(v.regions.find((r) => r.region === 'NEPAL')?.unavailableReason).toBe(
      'NO_APPROVED_AMOUNT',
    );
    expect(v.regions.find((r) => r.region === 'INDIA')?.unavailableReason).toBeNull();
    expect(errorOf(await expectStatus(start(student.agent, second, 'NEPAL'), 409)).message).toMatch(
      /No fee has been approved/,
    );
    const india = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, second, 'INDIA'), 200)).body,
    );
    expect(india.current?.amountMinor).toBe(250_000);

    // An application whose fee was never assessed (e.g. a third attempt) cannot pay anywhere.
    const subject = fixture.subjects[subjectCursor++ % fixture.subjects.length];
    const line = await testDb().programSubject.findFirstOrThrow({
      where: { curriculumId: fixture.curriculum.id, subjectId: subject?.id ?? '' },
    });
    const unassessed = await testDb().reExamApplication.create({
      data: {
        studentId: student.studentId,
        studentRegistrationId: student.registrationId,
        examinationId: reExamId,
        programSubjectId: line.id,
        subjectId: line.subjectId,
        attemptNumber: 3,
        attemptBasis: 'NON_REJECTED_RE_EXAM_APPLICATIONS',
        studentName: 'Synthetic Payer',
        registrationNumber: student.registrationNumber,
        programCode: fixture.program.code,
        programName: fixture.program.name,
        academicSessionName: `Synthetic batch ${fixture.master.session.code}`,
        periodLabel: 'Semester 1',
        subjectCode: subject?.code ?? '',
        subjectName: subject?.name ?? '',
        examinationName: 'Synthetic Re-examination',
        examSession: 'Synthetic',
        submittedByAccountId: student.accountId,
        feeStatus: 'NOT_CONFIGURED',
        feeBlockedReason: 'NO_RATE_FOR_ATTEMPT',
      },
    });
    const blocked = await view(student.agent, unassessed.id);
    expect(blocked.unavailableReason).toMatch(/No fee has been approved for this attempt/);
    expect(blocked.regions).toEqual([]);
    await expectStatus(start(student.agent, unassessed.id, 'INDIA'), 409);
    // The database refuses an invented obligation, too.
    const india2 = await testDb().reExamPaymentDestination.findFirstOrThrow({
      where: { region: 'INDIA', status: 'APPROVED' },
    });
    await expect(
      testDb().reExamPayment.create({
        data: {
          applicationId: second,
          studentId: student.studentId,
          destinationId: india2.id,
          region: 'INDIA',
          destinationVersion: india2.version,
          attemptNumber: 2,
          feeRuleId: feeRule.id,
          feeRuleVersion: feeRule.version,
          amountSource: 'FEE_RULE',
          amountMinor: 1,
          currency: 'INR',
          createdByAccountId: student.accountId,
        },
      }),
    ).rejects.toThrow(/assessed fee|already|one_live/);
  });

  it('hides switched-off and expired destinations and keeps old payments on their version', async () => {
    const student = await newStudent();
    const applicationId = await assessedApplication(student);
    const started = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    const paymentId = started.current?.id ?? '';
    const india = await testDb().reExamPaymentDestination.findFirstOrThrow({
      where: { region: 'INDIA', status: 'APPROVED' },
    });

    await expectStatus(
      maker.post(`re-exam-payment-destinations/${india.id}/active`, { active: false }),
      200,
    );
    const off = await view(student.agent, applicationId);
    expect(off.regions.find((r) => r.region === 'INDIA')?.unavailableReason).toBe('NOT_CONFIGURED');
    expect(off.current?.destination.available).toBe(false);
    await expectStatus(student.agent.get(`/api/v1/student/re-exam-payments/${paymentId}/qr`), 404);
    const another = await newStudent();
    await expectStatus(start(another.agent, await assessedApplication(another), 'INDIA'), 409);
    await expectStatus(
      maker.post(`re-exam-payment-destinations/${india.id}/active`, { active: true }),
      200,
    );
    await expectStatus(student.agent.get(`/api/v1/student/re-exam-payments/${paymentId}/qr`), 200);

    // A replacement (new QR) retires the old version; the started payment keeps pointing at it.
    const replacement = await publish('INDIA');
    expect(replacement.version).toBeGreaterThan(india.version);
    const old = await testDb().reExamPaymentDestination.findUniqueOrThrow({
      where: { id: india.id },
    });
    expect(old.status).toBe('RETIRED');
    const kept = await testDb().reExamPayment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(kept).toMatchObject({ destinationId: india.id, destinationVersion: india.version });
    // Its QR is withdrawn; choosing India again moves the student to the new version.
    await expectStatus(student.agent.get(`/api/v1/student/re-exam-payments/${paymentId}/qr`), 404);
    const moved = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    expect(moved.current?.id).not.toBe(paymentId);
    expect(moved.previous[0]?.status).toBe('VOID');

    // Expiry: a short validity window ends on its own.
    await publish('BANGLADESH', {
      currency: 'INR',
      effectiveUntil: new Date(Date.now() + 2_500).toISOString(),
    });
    const before = await view(student.agent, applicationId);
    expect(before.regions.find((r) => r.region === 'BANGLADESH')?.available).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const after = await view(student.agent, applicationId);
    expect(after.regions.find((r) => r.region === 'BANGLADESH')?.unavailableReason).toBe(
      'NOT_CONFIGURED',
    );
    await expectStatus(start(student.agent, applicationId, 'BANGLADESH'), 409);
    await retireRegion('BANGLADESH');
  });
});

describe('submission, review and separation from the academic decision', () => {
  it('validates references and evidence, verifies once and keeps the application decision separate', async () => {
    const student = await newStudent();
    const applicationId = await assessedApplication(student);
    const started = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    const paymentId = started.current?.id ?? '';

    // PINs, OTPs and junk are refused; extra (client-chosen) fields are refused.
    for (const reference of ['123456', 'my OTP 99887766', 'abc', '<script>1</script>']) {
      await expectStatus(submit(student.agent, paymentId, reference), 400);
    }
    await expectStatus(
      submit(student.agent, paymentId, 'UTR-SYNTH-0001', undefined, { amountMinor: '1' }),
      400,
    );
    // Unsafe evidence is refused (a disguised executable, a PDF with hidden script).
    await expectStatus(
      submit(student.agent, paymentId, 'UTR-SYNTH-0001', {
        bytes: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]),
        type: 'image/png',
        name: 'receipt.png',
      }),
      400,
    );
    await expectStatus(
      submit(student.agent, paymentId, 'UTR-SYNTH-0001', {
        bytes: pdfWithCompressedScript(),
        type: 'application/pdf',
        name: 'receipt.pdf',
      }),
      400,
    );
    const receipt = await receiptPng();
    const submitted = studentReExamPaymentViewSchema.parse(
      (
        await expectStatus(
          submit(student.agent, paymentId, 'utr synth 0001 77', {
            bytes: receipt,
            type: 'image/png',
            name: 'receipt.png',
          }),
          200,
        )
      ).body,
    );
    expect(submitted.current).toMatchObject({
      status: 'SUBMITTED',
      transactionReference: 'utr synth 0001 77',
      hasEvidence: true,
    });
    // Submitted payments cannot be edited, re-submitted or switched to another region.
    await expectStatus(submit(student.agent, paymentId, 'UTR-SYNTH-0002'), 409);
    await expectStatus(start(student.agent, applicationId, 'NEPAL'), 409);

    // The same reference (normalised) cannot back another student's payment.
    const other = await newStudent();
    const otherApp = await assessedApplication(other);
    const otherStart = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(other.agent, otherApp, 'INDIA'), 200)).body,
    );
    const duplicate = await expectStatus(
      submit(other.agent, otherStart.current?.id ?? '', 'UTR-SYNTH-000177'),
      409,
    );
    expect(errorOf(duplicate).details?.[0]?.path).toBe('transactionReference');

    // Staff search and evidence (audited); the evidence was stored without the uploaded bytes.
    const list = reExamPaymentListSchema.parse(
      (
        await expectStatus(
          approver.get('re-exam-payments?status=SUBMITTED&search=synth000177'),
          200,
        )
      ).body,
    );
    expect(list.data.map((row) => row.id)).toEqual([paymentId]);
    const evidence = await expectStatus(
      approver.agent.get(`/api/v1/re-exam-payments/${paymentId}/evidence`).buffer(true),
      200,
    );
    expect(evidence.headers['cache-control']).toBe('private, no-store');
    expect(evidence.headers['content-type']).toMatch(/^image\/png/);
    expect(
      await testDb().auditLog.count({
        where: { entityId: paymentId, action: 'RE_EXAM_PAYMENT_EVIDENCE_VIEWED' },
      }),
    ).toBe(1);
    await expectStatus(viewer.agent.get(`/api/v1/re-exam-payments/${paymentId}/evidence`), 403);

    // Verification needs the checkbox, the exact amount and currency, and the right permission.
    const verifyBody = {
      verifiedAmount: '1000.00',
      verifiedCurrency: 'INR',
      confirmedAgainstUniversityAccount: true,
    };
    await expectStatus(examAdmin.post(`re-exam-payments/${paymentId}/verify`, verifyBody), 403);
    await expectStatus(
      approver.post(`re-exam-payments/${paymentId}/verify`, {
        ...verifyBody,
        confirmedAgainstUniversityAccount: false,
      }),
      400,
    );
    await expectStatus(
      approver.post(`re-exam-payments/${paymentId}/verify`, {
        ...verifyBody,
        verifiedAmount: '999',
      }),
      409,
    );
    await expectStatus(
      approver.post(`re-exam-payments/${paymentId}/verify`, {
        ...verifyBody,
        verifiedCurrency: 'USD',
        verifiedAmount: '1000',
      }),
      409,
    );
    // Still SUBMITTED until someone explicitly verifies.
    expect((await view(student.agent, applicationId)).current?.status).toBe('SUBMITTED');

    // Two reviewers at once: exactly one decision wins.
    const [a, b] = await Promise.all([
      approver.post(`re-exam-payments/${paymentId}/verify`, verifyBody),
      approver2.post(`re-exam-payments/${paymentId}/reject`, { reason: 'Not found in statement' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const decided = reExamPaymentDetailSchema.parse(
      (await expectStatus(approver.get(`re-exam-payments/${paymentId}`), 200)).body,
    );
    expect(['VERIFIED', 'REJECTED']).toContain(decided.status);
    // Decisions are final, in the API and the database.
    await expectStatus(approver.post(`re-exam-payments/${paymentId}/verify`, verifyBody), 409);
    await expect(
      testDb().reExamPayment.update({
        where: { id: paymentId },
        data: { transactionReference: 'EDITED-REF-1' },
      }),
    ).rejects.toThrow(/cannot be edited|final/);
    await expect(testDb().reExamPayment.delete({ where: { id: paymentId } })).rejects.toThrow(
      /cannot be deleted/,
    );

    // Payment never decides the application; the application detail only shows the payment.
    const application = reExamApplicationDetailSchema.parse(
      (await expectStatus(examAdmin.get(`re-exam-applications/${applicationId}`), 200)).body,
    );
    expect(application.status).toBe('SUBMITTED');
    expect(application.payment).toMatchObject({ id: paymentId, status: decided.status });

    // The reference itself is never written into the audit log.
    const audit = await testDb().auditLog.findMany({ where: { entityId: paymentId } });
    expect(JSON.stringify(audit.map((entry) => entry.metadata))).not.toMatch(/SYNTH|synth 0001/i);
  });

  it('lets a student pay again after a rejection and stops payments for rejected applications', async () => {
    const student = await newStudent();
    const applicationId = await assessedApplication(student);
    const first = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    const firstId = first.current?.id ?? '';
    await expectStatus(submit(student.agent, firstId, 'TXN-RETRY-445566'), 200);
    await expectStatus(
      approver.post(`re-exam-payments/${firstId}/reject`, { reason: 'Amount not received yet' }),
      200,
    );
    const rejected = await view(student.agent, applicationId);
    expect(rejected.current).toBeNull();
    expect(rejected.previous[0]).toMatchObject({
      id: firstId,
      status: 'REJECTED',
      rejectionReason: 'Amount not received yet',
    });
    // The same reference may be submitted again after a rejection (staff see the earlier one).
    const retry = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    const retryId = retry.current?.id ?? '';
    await expectStatus(submit(student.agent, retryId, 'TXN-RETRY-445566'), 200);
    const detail = reExamPaymentDetailSchema.parse(
      (await expectStatus(approver.get(`re-exam-payments/${retryId}`), 200)).body,
    );
    expect(detail.sameReference).toEqual([
      expect.objectContaining({ id: firstId, status: 'REJECTED' }),
    ]);

    // Rejecting the APPLICATION leaves the submitted payment as it is (refunds are out of scope)…
    await expectStatus(
      examAdmin.post(`re-exam-applications/${applicationId}/reject`, {
        reason: 'Synthetic: not eligible for this re-examination',
      }),
      200,
    );
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: retryId } })).status,
    ).toBe('SUBMITTED');
    // …and no new payment can start for it.
    const closed = await view(student.agent, applicationId);
    expect(closed.unavailableReason).toMatch(/rejected/);
    await expectStatus(start(student.agent, applicationId, 'INDIA'), 409);

    // Approving an application does not touch an unverified payment either.
    const other = await assessedApplication(student);
    const pending = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, other, 'INDIA'), 200)).body,
    );
    await expectStatus(examAdmin.post(`re-exam-applications/${other}/approve`, {}), 200);
    const own = studentReExamApplicationSchema.parse(
      (await expectStatus(student.agent.get(`/api/v1/student/re-exam-applications/${other}`), 200))
        .body,
    );
    expect(own.status).toBe('APPROVED');
    expect(own.payment).toMatchObject({ id: pending.current?.id, status: 'AWAITING_PAYMENT' });
  });

  it('requires evidence where the destination says so', async () => {
    await publish('PAKISTAN', {
      currency: 'PKR',
      evidenceRequirement: 'REQUIRED',
      rates: [{ attemptNumber: 1, amount: '3500' }],
    });
    const student = await newStudent();
    const applicationId = await assessedApplication(student);
    const started = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'PAKISTAN'), 200)).body,
    );
    // Minor units follow the currency's own decimal places (PKR has none in the runtime's data).
    expect(started.current).toMatchObject({ currency: 'PKR', amountMinor: 3500 });
    const paymentId = started.current?.id ?? '';
    const missing = await expectStatus(submit(student.agent, paymentId, 'PK-SYNTH-998877'), 400);
    expect(errorOf(missing).details?.[0]?.path).toBe('evidence');
    await expectStatus(
      submit(student.agent, paymentId, 'PK-SYNTH-998877', {
        bytes: staticPdf(),
        type: 'application/pdf',
        name: 'receipt.pdf',
      }),
      200,
    );
    // Verification in the obligation's own currency only.
    await expectStatus(
      approver.post(`re-exam-payments/${paymentId}/verify`, {
        verifiedAmount: '1000',
        verifiedCurrency: 'INR',
        confirmedAgainstUniversityAccount: true,
      }),
      409,
    );
    await expectStatus(
      approver.post(`re-exam-payments/${paymentId}/verify`, {
        verifiedAmount: '3500',
        verifiedCurrency: 'PKR',
        confirmedAgainstUniversityAccount: true,
        note: 'Synthetic reconciliation line 42',
      }),
      200,
    );
    expect((await view(student.agent, applicationId)).current?.status).toBe('VERIFIED');
  });
});
