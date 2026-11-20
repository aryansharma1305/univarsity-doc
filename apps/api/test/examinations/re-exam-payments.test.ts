import type { INestApplication } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MockPaymentProvider,
  RazorpayClient,
  type RazorpayHttpPort,
  type RazorpayHttpRequest,
} from '@docversity/payments';
import {
  PaymentButtonPolicyService,
  RazorpayGatewayService,
} from '../../src/payment-buttons/payment-button-policy.service.js';
import { PaymentAlertsService } from '../../src/payment-buttons/payment-alerts.service.js';
import { RazorpayOrdersService } from '../../src/payment-buttons/razorpay-orders.service.js';
import { RazorpayReconciliationService } from '../../src/payment-buttons/razorpay-reconciliation.service.js';
import { PaymentButtonsService } from '../../src/payment-buttons/payment-buttons.service.js';
import { SandboxGatewayService } from '../../src/release-workflows/sandbox-gateway.service.js';
import { WorkflowPolicyService } from '../../src/release-workflows/workflow-policy.service.js';
import { ReExamPaymentsService } from '../../src/re-exams/re-exam-payments.service.js';
import { AuditService } from '../../src/audit/audit.service.js';
import {
  paymentButtonViewSchema,
  razorpayOrderViewSchema,
  razorpayReceiptsSchema,
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
import {
  pdfWithCompressedScript,
  pdfWithEncodedAction,
  staticPdf,
} from '../historical-documents/support.js';
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
let thirdAdmin: Staff;
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
  [maker, checker, thirdAdmin, registrar, examAdmin, approver, approver2, viewer] =
    await Promise.all([
      staff(app, ['SUPER_ADMIN']),
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

  it('refuses approval by whoever last changed the draft (details or QR)', async () => {
    await retireRegion('AFGHANISTAN');
    const draft = paymentDestinationDetailSchema.parse(
      (
        await expectStatus(
          maker.post('re-exam-payment-destinations', draftBody('AFGHANISTAN')),
          201,
        )
      ).body,
    );
    await expectStatus(uploadQr(maker, draft.id, await testQr('AFGHANISTAN')), 200);
    // The checker changes the beneficiary, then tries to approve their own change.
    await expectStatus(
      checker.patch(`re-exam-payment-destinations/${draft.id}`, {
        beneficiaryName: 'Synthetic changed beneficiary',
      }),
      200,
    );
    expect(
      errorOf(
        await expectStatus(
          checker.post(`re-exam-payment-destinations/${draft.id}/approve`, {
            confirmApproved: true,
          }),
          409,
        ),
      ).message,
    ).toMatch(/prepared or last changed/);
    // Replacing the QR counts as a change too.
    await expectStatus(uploadQr(thirdAdmin, draft.id, await testQr('AFGHANISTAN-2')), 200);
    await expectStatus(
      thirdAdmin.post(`re-exam-payment-destinations/${draft.id}/approve`, {
        confirmApproved: true,
      }),
      409,
    );
    // The database refuses it as well.
    await expect(
      testDb().reExamPaymentDestination.update({
        where: { id: draft.id },
        data: {
          status: 'APPROVED',
          isActive: true,
          approvedAt: new Date(),
          approvedByUserId: thirdAdmin.user.id,
        },
      }),
    ).rejects.toThrow(/approver_not_editor_check/);
    // Someone who neither prepared nor changed it may approve.
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
    expect(approved.status).toBe('APPROVED');
    await retireRegion('AFGHANISTAN');
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
    await expectStatus(
      submit(student.agent, paymentId, 'UTR-SYNTH-0001', {
        bytes: pdfWithEncodedAction(),
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

describe('application payment sandbox integration', () => {
  afterEach(() => vi.restoreAllMocks());
  async function sandboxCase() {
    await publish('INDIA', { evidenceRequirement: 'OPTIONAL' });
    const student = await newStudent();
    const applicationId = await assessedApplication(student);
    await expectStatus(start(student.agent, applicationId, 'INDIA'), 200);
    const payment = await testDb().reExamPayment.findFirstOrThrow({
      where: { applicationId, status: 'AWAITING_PAYMENT' },
    });
    const provider = new MockPaymentProvider({
      environment: 'SYNTHETIC_SANDBOX',
      secret: 'synthetic-only-payment-signature-secret-0001',
      maximumSkewSeconds: 300,
    });
    const service = app.get(ReExamPaymentsService);
    vi.spyOn(service, 'sandboxProvider').mockReturnValue(provider);
    const order = await service.createSandboxOrder(student.studentId, payment.id, randomUUID());
    const raw = Buffer.from(
      JSON.stringify({
        contractVersion: 1,
        environment: 'SYNTHETIC_SANDBOX',
        eventId: randomUUID(),
        orderId: order.orderId,
        reference: payment.id,
        type: 'ORDER_PAID',
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      }),
    );
    const now = new Date();
    const headers = provider.signWebhook(raw, String(Math.floor(now.getTime() / 1000)));
    return { student, applicationId, payment, provider, service, order, raw, now, headers };
  }
  it('uses owned server-side obligations and submits signed mock receipts once without Finance or academic approval', async () => {
    const c = await sandboxCase();
    const other = await newStudent();
    await expect(
      c.service.createSandboxOrder(other.studentId, c.payment.id, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await Promise.all([
      c.service.acceptSandboxWebhook(c.raw, c.headers, c.now),
      c.service.acceptSandboxWebhook(c.raw, c.headers, c.now),
    ]);
    const saved = await testDb().reExamPayment.findUniqueOrThrow({ where: { id: c.payment.id } });
    expect(saved.status).toBe('SUBMITTED');
    expect(saved.reviewedAt).toBeNull();
    const application = await testDb().reExamApplication.findUniqueOrThrow({
      where: { id: c.applicationId },
    });
    expect(application.status).toBe('SUBMITTED');
    expect(application.feeStatus).toBe('ASSESSED');
    const events = await testDb().auditLog.findMany({
      where: {
        entityType: 'ReExamPayment',
        entityId: c.payment.id,
        action: 'RE_EXAM_PAYMENT_SUBMITTED',
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({
      source: 'SYNTHETIC_SANDBOX',
      providerOrderId: c.order.orderId,
    });
  });
  it('refuses invalid signatures and recovers a signed callback after transactional audit failure', async () => {
    const c = await sandboxCase();
    await expect(
      c.service.acceptSandboxWebhook(c.raw, { ...c.headers, signature: '0'.repeat(64) }, c.now),
    ).rejects.toMatchObject({ status: 400 });
    const audit = vi
      .spyOn(app.get(AuditService), 'writeAuditEvent')
      .mockRejectedValueOnce(new Error('Synthetic callback audit failure'));
    await expect(c.service.acceptSandboxWebhook(c.raw, c.headers, c.now)).rejects.toThrow(
      'Synthetic callback audit failure',
    );
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: c.payment.id } })).status,
    ).toBe('AWAITING_PAYMENT');
    audit.mockRestore();
    await c.service.acceptSandboxWebhook(c.raw, c.headers, c.now);
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: c.payment.id } })).status,
    ).toBe('SUBMITTED');
  });
  it('has no enabled sandbox provider by default', async () => {
    const service = app.get(ReExamPaymentsService);
    await expect(
      service.createSandboxOrder(randomUUID(), randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
  async function durableCase() {
    const c = await sandboxCase();
    const application = await testDb().reExamApplication.findUniqueOrThrow({
      where: { id: c.applicationId },
    });
    const policy = {
      contractVersion: 1,
      usage: 'SYNTHETIC_ONLY',
      fixtureReference: 'SYN-DURABLE-GATEWAY',
      registrationIds: [application.studentRegistrationId],
      gatewaySecret: 'synthetic-only-payment-signature-secret-0001',
    };
    vi.spyOn(app.get(WorkflowPolicyService), 'definition').mockReturnValue(policy);
    const gateway = app.get(SandboxGatewayService);
    const request = { requestId: randomUUID(), paymentId: c.payment.id };
    const order = await gateway.create(c.student.studentId, request);
    const envelope = (eventId = randomUUID(), amountMinor = order.amountMinor) => {
      const raw = Buffer.from(
        JSON.stringify({
          contractVersion: 1,
          environment: 'SYNTHETIC_SANDBOX',
          eventId,
          orderId: order.orderId,
          reference: c.payment.id,
          type: 'ORDER_PAID',
          amountMinor,
          currency: order.currency,
        }),
      );
      return {
        payloadBase64: raw.toString('base64'),
        ...c.provider.signWebhook(raw, String(Math.floor(Date.now() / 1000))),
      };
    };
    return { ...c, policy, gateway, request, order, envelope };
  }
  it('persists signed gateway callbacks atomically and refuses foreign checkout', async () => {
    const c = await durableCase(),
      foreign = await newStudent();
    expect(
      (
        await studentPost(foreign.agent, 'student/sandbox-gateway/orders', {
          requestId: randomUUID(),
          paymentId: c.payment.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (await studentPost(c.student.agent, 'student/sandbox-gateway/orders', c.request)).status,
    ).toBe(200);
    const body = c.envelope();
    const responses = await Promise.all([
      browser(app).post('/api/v1/sandbox-gateway/callback').send(body),
      browser(app).post('/api/v1/sandbox-gateway/callback').send(body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await testDb().sandboxGatewayReceipt.count({ where: { orderId: c.order.orderId } }),
    ).toBe(1);
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: c.payment.id } })).status,
    ).toBe('SUBMITTED');
    const application = await testDb().reExamApplication.findUniqueOrThrow({
      where: { id: c.applicationId },
    });
    expect(application.status).toBe('SUBMITTED');
    expect(application.feeStatus).toBe('ASSESSED');
    await viewer.get(`synthetic-workflows/gateway/${c.order.orderId}/reconcile`).expect(403);
  });
  it('refuses forged or mismatched callbacks and rolls back payment/order/receipt on audit failure', async () => {
    const c = await durableCase(),
      body = c.envelope();
    await browser(app)
      .post('/api/v1/sandbox-gateway/callback')
      .send({ ...body, signature: '0'.repeat(64) })
      .expect(400);
    await browser(app)
      .post('/api/v1/sandbox-gateway/callback')
      .send(c.envelope(randomUUID(), c.order.amountMinor + 1))
      .expect(404);
    const audit = vi
      .spyOn(app.get(AuditService), 'writeAuditEvent')
      .mockRejectedValueOnce(new Error('Synthetic durable audit failure'));
    await browser(app).post('/api/v1/sandbox-gateway/callback').send(body).expect(500);
    audit.mockRestore();
    expect(
      (await testDb().sandboxGatewayOrder.findUniqueOrThrow({ where: { id: c.order.orderId } }))
        .status,
    ).toBe('CREATED');
    expect(
      await testDb().sandboxGatewayReceipt.count({ where: { orderId: c.order.orderId } }),
    ).toBe(0);
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: c.payment.id } })).status,
    ).toBe('AWAITING_PAYMENT');
    await browser(app).post('/api/v1/sandbox-gateway/callback').send(body).expect(200);
  });
  it('recovers durable receipts after service restart and serializes refunds/reconciliation', async () => {
    const c = await durableCase(),
      body = c.envelope();
    await browser(app).post('/api/v1/sandbox-gateway/callback').send(body).expect(200);
    const restarted = await createTestApp(realConfig());
    try {
      vi.spyOn(restarted.get(WorkflowPolicyService), 'definition').mockReturnValue(c.policy);
      await restarted.get(SandboxGatewayService).callback(body, '127.0.0.1');
      expect(
        (await restarted.get(SandboxGatewayService).reconcile(c.order.orderId)).receipts,
      ).toHaveLength(1);
    } finally {
      await restarted.close();
    }
    const amount = Math.ceil(c.order.amountMinor * 0.8);
    const refunds = await Promise.all([
      maker.post(`synthetic-workflows/gateway/${c.order.orderId}/refund`, {
        requestId: randomUUID(),
        amountMinor: amount,
        confirmed: true,
      }),
      maker.post(`synthetic-workflows/gateway/${c.order.orderId}/refund`, {
        requestId: randomUUID(),
        amountMinor: amount,
        confirmed: true,
      }),
    ]);
    expect(refunds.map((r) => r.status).sort()).toEqual([200, 409]);
    const rest = c.order.amountMinor - amount,
      request = { requestId: randomUUID(), amountMinor: rest, confirmed: true };
    await maker.post(`synthetic-workflows/gateway/${c.order.orderId}/refund`, request).expect(200);
    await maker.post(`synthetic-workflows/gateway/${c.order.orderId}/refund`, request).expect(200);
    const result = await c.gateway.reconcile(c.order.orderId);
    expect(result.order.status).toBe('REFUNDED');
    expect(result.order.refundedMinor).toBe(c.order.amountMinor);
    expect(result.receipts).toHaveLength(3);
    const receipt = await testDb().sandboxGatewayReceipt.findFirstOrThrow({
      where: { orderId: c.order.orderId },
    });
    await expect(
      testDb().sandboxGatewayReceipt.update({
        where: { id: receipt.id },
        data: { amountMinor: 1 },
      }),
    ).rejects.toThrow();
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: c.payment.id } })).status,
    ).toBe('SUBMITTED');
  });
});

describe('Razorpay disabled collection and manual report reconciliation', () => {
  afterEach(() => vi.restoreAllMocks());
  const secret = 'synthetic-razorpay-webhook-secret-000000000';
  const merchant = 'acc_SyntheticMentor';
  const buttonId = 'pl_TyWTRF7DImX3Pu';
  // Test mode as runtime configuration would build it (synthetic values; no code-held secret).
  function policy(student: Student) {
    vi.spyOn(app.get(PaymentButtonPolicyService), 'fixture').mockReturnValue({
      mode: 'TEST',
      merchantId: merchant,
      keyId: 'rzp_test_SYNTHETIC',
      keySecret: 'synthetic-key-secret-0000',
      webhookSecret: secret,
      registrationIds: [student.registrationId],
      refunds: 'off',
    });
  }
  function notification(paymentId: string, overrides: Record<string, unknown> = {}) {
    return {
      entity: 'event',
      account_id: merchant,
      event: 'payment.captured',
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: 'payment',
            amount: 100000,
            currency: 'INR',
            captured: true,
            status: 'captured',
            amount_refunded: 0,
            email: 'fictional@example.test',
            notes: { applicationId: 'UNTRUSTED' },
            ...overrides,
          },
        },
      },
    };
  }
  async function webhook(payload: unknown, eventId = `evt_${randomUUID()}`, invalid = false) {
    const raw = JSON.stringify(payload);
    const signature = invalid
      ? '0'.repeat(64)
      : createHmac('sha256', secret).update(raw).digest('hex');
    return browser(app)
      .post('/api/v1/payment-buttons/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signature)
      .set('X-Razorpay-Event-Id', eventId)
      .send(raw);
  }
  async function obligation() {
    await publish('INDIA');
    const student = await newStudent();
    const applicationId = await assessedApplication(student);
    const v = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    if (!v.current) throw new Error('payment missing');
    return { student, applicationId, payment: v.current };
  }
  it('keeps collection and webhooks disabled by default, with ownership and principal separation', async () => {
    const { student, applicationId, payment } = await obligation();
    const own = await student.agent
      .get(`/api/v1/student/payment-buttons/re-exam/${applicationId}`)
      .expect(200);
    expect(own.headers['cache-control']).toBe('no-store');
    expect(own.body).toMatchObject({
      status: 'PENDING',
      paymentId: payment.id,
      checkout: null,
      liveTransactionsEnabled: false,
      qrFallbackEnabled: false,
    });
    const other = await newStudent();
    await other.agent.get(`/api/v1/student/payment-buttons/re-exam/${applicationId}`).expect(404);
    await maker.get(`student/payment-buttons/re-exam/${applicationId}`).expect(401);
    await webhook(notification('pay_SyntheticDisabled')).then((r) => {
      expect(r.status).toBe(404);
    });
    await approver
      .post('payment-buttons/reconcile', {
        receiptId: randomUUID(),
        paymentId: payment.id,
        buttonId,
        confirmedStudentOwnership: true,
        confirmedAgainstProviderRecords: true,
        reportReference: 'SYNTHETIC-REPORT',
      })
      .expect(404);
  });
  it('does not make exam records or certificate requests payable and checks their ownership', async () => {
    const { student, applicationId } = await obligation();
    policy(student);
    const regular = await examination(examAdmin, fixture, { kind: 'REGULAR', period: 1 });
    await student.agent
      .get(`/api/v1/student/payment-buttons/exam/${student.registrationId}/${regular.id}`)
      .expect(200)
      .then((r) => {
        expect(r.body).toMatchObject({ service: 'EXAM', checkout: null, status: 'UNAVAILABLE' });
      });
    const other = await newStudent();
    await other.agent
      .get(`/api/v1/student/payment-buttons/exam/${student.registrationId}/${regular.id}`)
      .expect(404);
    const request = await testDb().certificateRequest.create({
      data: {
        reference: `SYNTH-${randomUUID()}`,
        studentId: student.studentId,
        certificateType: 'TRANSCRIPT',
        policyId: 'synthetic',
        policyVersion: 1,
        policySnapshot: { synthetic: true },
        purpose: 'Synthetic hard-copy boundary test',
        events: {
          create: {
            version: 1,
            status: 'SUBMITTED',
            action: 'SUBMIT',
            actorStudentId: student.studentId,
          },
        },
        submissionKey: randomUUID(),
      },
    });
    await student.agent
      .get(`/api/v1/student/payment-buttons/certificate/${request.id}`)
      .expect(200)
      .then((r) => {
        expect(r.body).toMatchObject({
          certificateFeeScope: 'HARD_COPY_ONLY',
          checkout: null,
          status: 'UNAVAILABLE',
        });
      });
    await other.agent.get(`/api/v1/student/payment-buttons/certificate/${request.id}`).expect(404);
    await student.agent
      .get(`/api/v1/student/payment-buttons/re-exam/${applicationId}`)
      .expect(200)
      .then((r) => {
        // Test collection now uses the Orders API; the panel never embeds a Payment Button.
        expect(paymentButtonViewSchema.parse(r.body).checkout).toBeNull();
      });
  });
  it('persists verified bytes atomically, strips PII, and deduplicates concurrent events without fulfillment', async () => {
    const { student, payment } = await obligation();
    policy(student);
    const providerId = `pay_${randomUUID().replaceAll('-', '')}`;
    const payload = notification(providerId);
    const eventId = `evt_${randomUUID()}`;
    const replies = await Promise.all([webhook(payload, eventId), webhook(payload, eventId)]);
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    expect(replies[0].body).toEqual({ received: true, attributed: false });
    expect(await testDb().razorpayWebhookReceipt.count({ where: { eventId } })).toBe(1);
    const receipt = await testDb().razorpayWebhookReceipt.findUniqueOrThrow({ where: { eventId } });
    expect(JSON.stringify(receipt)).not.toMatch(/fictional|UNTRUSTED|email|notes/);
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe('AWAITING_PAYMENT');
    // Plan section 8.3: a signed body is authentic, so a digest conflict is stored and answered 2xx.
    await webhook(notification(providerId, { amount: 100001 }), eventId).then((r) => {
      expect(r.status).toBe(200);
    });
    expect(
      await testDb().razorpayWebhookIgnored.count({
        where: { eventId, reason: 'DIGEST_CONFLICT' },
      }),
    ).toBe(1);
    await webhook(notification(providerId), `evt_${randomUUID()}`, true).then((r) => {
      expect(r.status).toBe(400);
    });
    const wrongAccount = `evt_${randomUUID()}`;
    await webhook({ ...notification(providerId), account_id: 'acc_Wrong' }, wrongAccount).then(
      (r) => {
        expect(r.status).toBe(200);
      },
    );
    const uncaptured = `evt_${randomUUID()}`;
    await webhook(notification(providerId, { captured: false }), uncaptured).then((r) => {
      expect(r.status).toBe(200);
    });
    expect(
      (
        await testDb().razorpayWebhookIgnored.findMany({
          where: { eventId: { in: [wrongAccount, uncaptured] } },
          orderBy: { createdAt: 'asc' },
        })
      ).map((row) => row.reason),
    ).toEqual(['ACCOUNT_MISMATCH', 'UNPARSEABLE']);
    expect(
      await testDb().razorpayWebhookReceipt.count({
        where: { eventId: { in: [wrongAccount, uncaptured] } },
      }),
    ).toBe(0);
    const audit = vi
      .spyOn(app.get(AuditService), 'writeAuditEvent')
      .mockRejectedValueOnce(new Error('synthetic failure'));
    const failedId = `evt_${randomUUID()}`;
    await webhook(payload, failedId).then((r) => {
      expect(r.status).toBe(500);
    });
    expect(await testDb().razorpayWebhookReceipt.count({ where: { eventId: failedId } })).toBe(0);
    audit.mockRestore();
    await webhook(payload, failedId).then((r) => {
      expect(r.status).toBe(200);
    });
  });
  it('requires staff permission, CSRF, full money match, correct service and manual ownership confirmation', async () => {
    const { student, payment, applicationId } = await obligation();
    policy(student);
    const providerId = `pay_${randomUUID().replaceAll('-', '')}`;
    await expectStatus(submit(student.agent, payment.id, providerId), 200);
    const eventId = `evt_${randomUUID()}`;
    await webhook(notification(providerId), eventId).then((r) => {
      expect(r.status).toBe(200);
    });
    const receipt = await testDb().razorpayWebhookReceipt.findUniqueOrThrow({ where: { eventId } });
    const body = {
      receiptId: receipt.id,
      paymentId: payment.id,
      buttonId,
      confirmedStudentOwnership: true,
      confirmedAgainstProviderRecords: true,
      reportReference: 'SYNTHETIC-MENTOR-REPORT',
    };
    for (const member of [viewer, registrar, examAdmin])
      await member.post('payment-buttons/reconcile', body).expect(403);
    await studentPost(student.agent, 'payment-buttons/reconcile', body).then((r) => {
      expect(r.status).toBe(401);
    });
    await approver.agent.post('/api/v1/payment-buttons/reconcile').send(body).expect(403);
    await approver
      .post('payment-buttons/reconcile', { ...body, buttonId: 'pl_TyWPTClJKY5RFa' })
      .expect(400);
    await approver
      .post('payment-buttons/reconcile', { ...body, confirmedStudentOwnership: false })
      .expect(400);
    const badId = `evt_${randomUUID()}`;
    await webhook(notification(providerId, { amount: 99999 }), badId);
    const bad = await testDb().razorpayWebhookReceipt.findUniqueOrThrow({
      where: { eventId: badId },
    });
    await approver.post('payment-buttons/reconcile', { ...body, receiptId: bad.id }).expect(409);
    const refId = `evt_${randomUUID()}`;
    await webhook(notification(providerId, { amount_refunded: 1 }), refId);
    const refunded = await testDb().razorpayWebhookReceipt.findUniqueOrThrow({
      where: { eventId: refId },
    });
    await approver
      .post('payment-buttons/reconcile', { ...body, receiptId: refunded.id })
      .expect(409);
    const before = await testDb().reExamApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    const audit = vi
      .spyOn(app.get(AuditService), 'writeAuditEvent')
      .mockRejectedValueOnce(new Error('synthetic audit failure'));
    await approver.post('payment-buttons/reconcile', body).expect(500);
    expect(await testDb().razorpayReconciliation.count({ where: { paymentId: payment.id } })).toBe(
      0,
    );
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe('SUBMITTED');
    audit.mockRestore();
    const results = await Promise.all([
      approver.post('payment-buttons/reconcile', body),
      approver.post('payment-buttons/reconcile', body),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await testDb().razorpayReconciliation.count({ where: { providerPaymentId: providerId } }),
    ).toBe(1);
    expect(
      (await testDb().reExamApplication.findUniqueOrThrow({ where: { id: applicationId } })).status,
    ).toBe(before.status);
    await student.agent
      .get(`/api/v1/student/payment-buttons/re-exam/${applicationId}`)
      .expect(200)
      .then((r) => {
        expect(r.body).toMatchObject({ status: 'PAID', checkout: null });
      });
    await approver
      .get(`payment-buttons/re-exam/${payment.id}/receipts`)
      .expect(200)
      .then((r) => {
        expect(razorpayReceiptsSchema.parse(r.body).data.length).toBeGreaterThan(0);
      });
    await approver
      .post('payment-buttons/reconcile', { ...body, reportReference: 'CHANGED-REPORT' })
      .expect(409);
  });
  it('fails closed on rate-limit storage failure and cannot enable collection outside isolated tests', async () => {
    const { student } = await obligation();
    policy(student);
    const service = app.get(PaymentButtonsService);
    const limiter = app.get((await import('../../src/auth/rate-limiter.js')).RateLimiter);
    vi.spyOn(limiter, 'hit').mockRejectedValueOnce(new Error('synthetic Redis outage'));
    await expect(
      service.webhook(Buffer.from('{}'), '0'.repeat(64), 'evt_down', '127.0.0.1'),
    ).rejects.toThrow();
    const productionPolicy = new PaymentButtonPolicyService(
      realConfig({ NODE_ENV: 'production', COOKIE_SECURE: true }),
    );
    expect(productionPolicy.fixture()).toBeNull();
  });
});

describe('Razorpay test-mode Orders pilot (synthetic secrets, fake provider port, no network)', () => {
  afterEach(() => vi.restoreAllMocks());
  const secret = 'synthetic-razorpay-webhook-secret-111111111';
  const keySecret = 'synthetic-key-secret-1111';
  const keyId = 'rzp_test_SYNTHETIC';
  const merchant = 'acc_SyntheticPilot';
  const rid = () => randomUUID().replaceAll('-', '').slice(0, 14);
  const reply = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body) });

  /** An in-memory stand-in for the Orders/Payments API behind the injectable HTTP port. */
  function provider() {
    const orders: {
      id: string;
      entity: 'order';
      amount: number;
      currency: string;
      receipt: string;
      status: string;
    }[] = [];
    const payments = new Map<string, Record<string, unknown>>();
    const calls: RazorpayHttpRequest[] = [];
    let createFailure: { status: number; afterStore: boolean } | null = null;
    let malformedFetch = false;
    const port: RazorpayHttpPort = (request) => {
      calls.push(request);
      if (request.method === 'POST' && request.path === '/orders') {
        const body = JSON.parse(request.body ?? '{}') as {
          amount: number;
          currency: string;
          receipt: string;
        };
        if (orders.some((o) => o.receipt === body.receipt))
          return Promise.resolve(
            reply(
              {
                error: {
                  description: 'Duplicate request. This request has already been processed.',
                },
              },
              400,
            ),
          );
        const failure = createFailure;
        createFailure = null;
        if (failure && !failure.afterStore) return Promise.resolve(reply({}, failure.status));
        const order = {
          id: `order_${rid()}`,
          entity: 'order' as const,
          amount: body.amount,
          currency: body.currency,
          receipt: body.receipt,
          status: 'created',
        };
        orders.push(order);
        // The order exists at Razorpay but the response is lost (crash/timeout before we store it).
        if (failure) return Promise.resolve(reply({}, failure.status));
        return Promise.resolve(reply(order));
      }
      const byReceipt = /^\/orders\?receipt=(.+)$/.exec(request.path);
      if (request.method === 'GET' && byReceipt)
        return Promise.resolve(
          reply({
            entity: 'collection',
            items: orders.filter((o) => o.receipt === decodeURIComponent(byReceipt[1] ?? '')),
          }),
        );
      const ofOrder = /^\/orders\/(order_[A-Za-z0-9]+)\/payments$/.exec(request.path);
      if (request.method === 'GET' && ofOrder)
        return Promise.resolve(
          reply({
            entity: 'collection',
            items: [...payments.values()].filter((p) => p.order_id === ofOrder[1]),
          }),
        );
      if (request.method === 'GET' && request.path.startsWith('/settlements/recon/combined?'))
        return Promise.resolve(reply({ entity: 'collection', count: 0, items: [] }));
      if (malformedFetch && request.path.startsWith('/payments/'))
        return Promise.resolve({ status: 200, body: '<html>not json</html>' });
      const pay = /^\/payments\/(pay_[A-Za-z0-9]+)$/.exec(request.path);
      const found = pay ? payments.get(pay[1] ?? '') : undefined;
      if (request.method === 'GET' && found) return Promise.resolve(reply(found));
      return Promise.resolve(reply({ error: { description: 'not found' } }, 404));
    };
    return {
      orders,
      payments,
      calls,
      port,
      creates: () => calls.filter((c) => c.method === 'POST' && c.path === '/orders').length,
      failNextCreate: (status: number, afterStore = false) => {
        createFailure = { status, afterStore };
      },
      malformedFetches: (on: boolean) => {
        malformedFetch = on;
      },
    };
  }
  type Provider = ReturnType<typeof provider>;

  function enable(
    registrationIds: string[],
    fake: Provider,
    refunds: 'off' | 'full_only' | 'partial' = 'off',
  ) {
    vi.spyOn(app.get(PaymentButtonPolicyService), 'fixture').mockReturnValue({
      mode: 'TEST',
      merchantId: merchant,
      keyId,
      keySecret,
      webhookSecret: secret,
      registrationIds,
      refunds,
    });
    vi.spyOn(app.get(RazorpayGatewayService), 'client').mockImplementation(
      () => new RazorpayClient(keyId, keySecret, fake.port),
    );
  }
  /** The operator's DB marker (razorpay_test_registrations) that a registration is synthetic. */
  const markSynthetic = (registrationId: string) =>
    testDb().razorpayTestRegistration.upsert({
      where: { registrationId },
      create: { registrationId, markedByUserId: maker.user.id, note: 'Synthetic CI registration' },
      update: {},
    });
  async function obligation({ synthetic = true } = {}) {
    await publish('INDIA');
    const student = await newStudent();
    if (synthetic) await markSynthetic(student.registrationId);
    const applicationId = await assessedApplication(student);
    const v = studentReExamPaymentViewSchema.parse(
      (await expectStatus(start(student.agent, applicationId, 'INDIA'), 200)).body,
    );
    if (!v.current) throw new Error('payment missing');
    return { student, applicationId, payment: v.current };
  }
  const createOrder = (agent: Agent, paymentId: string) =>
    studentPost(agent, `student/re-exam-payments/${paymentId}/razorpay-order`);
  async function paidOrder(fake: Provider) {
    const o = await obligation();
    enable([o.student.registrationId], fake);
    const view = razorpayOrderViewSchema.parse(
      (await expectStatus(createOrder(o.student.agent, o.payment.id), 200)).body,
    );
    const due = await testDb().reExamPayment.findUniqueOrThrow({ where: { id: o.payment.id } });
    const providerPaymentId = `pay_${rid()}`;
    fake.payments.set(providerPaymentId, {
      id: providerPaymentId,
      entity: 'payment',
      amount: due.amountMinor,
      currency: due.currency,
      status: 'captured',
      captured: true,
      amount_refunded: 0,
      order_id: view.orderId,
    });
    return { ...o, orderId: view.orderId, providerPaymentId, due };
  }
  function captureEvent(
    name: 'payment.captured' | 'order.paid',
    orderId: string,
    paymentId: string,
    amount: number,
    overrides: Record<string, unknown> = {},
  ) {
    const payment = {
      id: paymentId,
      entity: 'payment',
      amount,
      currency: 'INR',
      status: 'captured',
      captured: true,
      amount_refunded: 0,
      order_id: orderId,
      email: 'fictional@example.test',
      contact: '+910000000000',
      ...overrides,
    };
    return {
      entity: 'event',
      account_id: merchant,
      event: name,
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: { entity: payment },
        ...(name === 'order.paid'
          ? {
              order: {
                entity: {
                  id: orderId,
                  entity: 'order',
                  amount,
                  currency: payment.currency,
                  status: 'paid',
                },
              },
            }
          : {}),
      },
    };
  }
  function signed(
    body: string | Buffer,
    eventId = `evt_${randomUUID()}`,
    type = 'application/json',
    target: INestApplication = app,
  ) {
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return browser(target)
      .post('/api/v1/payment-buttons/webhook')
      .set('Content-Type', type)
      .set('X-Razorpay-Signature', createHmac('sha256', secret).update(raw).digest('hex'))
      .set('X-Razorpay-Event-Id', eventId)
      .send(raw.toString('utf8')); // superagent would JSON-encode a Buffer
  }
  const deliver = (payload: unknown, eventId?: string) => signed(JSON.stringify(payload), eventId);
  const orderRow = (orderId: string) =>
    testDb().razorpayOrder.findUniqueOrThrow({
      where: { providerOrderId: orderId },
      include: { events: true },
    });

  it('with mode off, every Razorpay route answers 404 as before and nothing is stored', async () => {
    expect(app.get(PaymentButtonPolicyService).fixture()).toBeNull();
    const { student, payment } = await obligation();
    const limiter = vi.spyOn(
      app.get((await import('../../src/auth/rate-limiter.js')).RateLimiter),
      'hit',
    );
    const client = vi.spyOn(app.get(RazorpayGatewayService), 'client');
    const alerts = vi.spyOn(app.get(PaymentAlertsService), 'notify');
    const counts = () =>
      Promise.all([
        testDb().razorpayWebhookReceipt.count(),
        testDb().razorpayWebhookIgnored.count(),
        testDb().razorpayOrder.count(),
        testDb().auditLog.count({ where: { action: { startsWith: 'RAZORPAY_' } } }),
      ]);
    const beforeCounts = await counts();
    const body = JSON.stringify(
      captureEvent('payment.captured', 'order_Off', 'pay_OffMode', 100000),
    );
    const before = await testDb().razorpayWebhookIgnored.count();
    for (const type of ['application/json', 'text/plain', 'application/octet-stream']) {
      const r = await signed(body, `evt_${randomUUID()}`, type);
      expect(r.status).toBe(404);
      expect((r.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    }
    expect((await signed(Buffer.alloc(70_000, 'a'))).status).toBe(413); // unchanged JSON body cap
    await expectStatus(createOrder(student.agent, payment.id), 404);
    await expectStatus(
      studentPost(student.agent, `student/re-exam-payments/${payment.id}/razorpay-return`, {
        razorpay_order_id: 'order_Off',
        razorpay_payment_id: 'pay_OffMode',
        razorpay_signature: 'a'.repeat(64),
      }),
      404,
    );
    expect(await testDb().razorpayWebhookIgnored.count()).toBe(before);
    expect(await testDb().razorpayOrder.count({ where: { paymentId: payment.id } })).toBe(0);
    // No receipt, audit or order written; no rate-limit counter touched; no provider client built.
    expect(await counts()).toEqual(beforeCounts);
    expect(limiter).not.toHaveBeenCalled();
    expect(client).not.toHaveBeenCalled();
    expect(alerts).not.toHaveBeenCalled();
    await expect(app.get(RazorpayReconciliationService).run()).rejects.toMatchObject({
      status: 404,
    });
  });

  it('creates one order from the server-side obligation, replays it and serializes concurrent requests', async () => {
    const fake = provider();
    // Created first: each obligation() republishes the INDIA destination, retiring older ones.
    const unmarked = await obligation({ synthetic: false });
    const { student, payment } = await obligation();
    const due = await testDb().reExamPayment.findUniqueOrThrow({ where: { id: payment.id } });
    // Not on the allowlist, another student, no CSRF: all refused before any provider call.
    enable([randomUUID()], fake);
    await expectStatus(createOrder(student.agent, payment.id), 404);
    // Allowlisted in config but not marked synthetic in the database: refused, and the DB agrees.
    enable([unmarked.student.registrationId], fake);
    await expectStatus(createOrder(unmarked.student.agent, unmarked.payment.id), 404);
    const due2 = await testDb().reExamPayment.findUniqueOrThrow({
      where: { id: unmarked.payment.id },
    });
    await expect(
      testDb().razorpayOrder.create({
        data: {
          paymentId: due2.id,
          attempt: 1,
          receipt: `rx_${due2.id.replaceAll('-', '')}_1`,
          mode: 'TEST',
          accountId: merchant,
          amountMinor: due2.amountMinor,
          currency: due2.currency,
          studentAccountId: unmarked.student.accountId,
        },
      }),
    ).rejects.toThrow(/not marked synthetic/);
    enable([student.registrationId], fake);
    const other = await newStudent();
    await expectStatus(createOrder(other.agent, payment.id), 404);
    expect(
      (await student.agent.post(`/api/v1/student/re-exam-payments/${payment.id}/razorpay-order`))
        .status,
    ).toBe(403);
    expect(fake.creates()).toBe(0);

    const first = razorpayOrderViewSchema.parse(
      (await expectStatus(createOrder(student.agent, payment.id), 200)).body,
    );
    expect(first).toMatchObject({
      keyId,
      amountMinor: due.amountMinor,
      currency: due.currency,
      mode: 'TEST',
    });
    const sent = JSON.parse(fake.calls.find((c) => c.method === 'POST')?.body ?? '{}') as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({ amount: due.amountMinor, currency: due.currency });
    expect(sent.receipt).toMatch(/^rx_[0-9a-f]{32}_1$/);
    expect(JSON.stringify(sent)).not.toMatch(/Synthetic Payer|@|registration/i);
    const again = razorpayOrderViewSchema.parse(
      (await expectStatus(createOrder(student.agent, payment.id), 200)).body,
    );
    expect(again.orderId).toBe(first.orderId);
    expect(fake.creates()).toBe(1);

    const second = await obligation();
    enable([second.student.registrationId], fake);
    const replies = await Promise.all(
      Array.from({ length: 10 }, () => createOrder(second.student.agent, second.payment.id)),
    );
    expect(replies.every((r) => [200, 429].includes(r.status))).toBe(true);
    const ids = new Set(
      replies.filter((r) => r.status === 200).map((r) => (r.body as { orderId: string }).orderId),
    );
    expect(ids.size).toBe(1);
    expect(fake.creates()).toBe(2);
    expect(await testDb().razorpayOrder.count({ where: { paymentId: second.payment.id } })).toBe(1);
    expect(
      await testDb().auditLog.count({
        where: {
          action: 'RAZORPAY_ORDER_CREATED',
          entityType: 'RazorpayOrder',
          metadata: { path: ['paymentId'], equals: second.payment.id },
        },
      }),
    ).toBe(1);
  });

  it('recovers an order created at Razorpay whose response was lost, and fails closed on refusals', async () => {
    const fake = provider();
    const { student, payment } = await obligation();
    enable([student.registrationId], fake);
    fake.failNextCreate(504, true);
    await expectStatus(createOrder(student.agent, payment.id), 503);
    expect(
      (await testDb().razorpayOrder.findFirstOrThrow({ where: { paymentId: payment.id } })).status,
    ).toBe('RESERVED');
    const view = razorpayOrderViewSchema.parse(
      (await expectStatus(createOrder(student.agent, payment.id), 200)).body,
    );
    expect(fake.creates()).toBe(1); // found through GET /orders?receipt=, never created twice
    expect(view.orderId).toBe(fake.orders[0]?.id);

    const refused = await obligation();
    enable([refused.student.registrationId], fake);
    fake.failNextCreate(401);
    await expectStatus(createOrder(refused.student.agent, refused.payment.id), 503);
    const failed = await testDb().razorpayOrder.findFirstOrThrow({
      where: { paymentId: refused.payment.id },
      include: { events: true },
    });
    expect(failed.status).toBe('CREATE_FAILED');
    expect(failed.events.map((e) => e.reason)).toContain('REJECTED');
    await expectStatus(createOrder(refused.student.agent, refused.payment.id), 200);
    expect(
      (
        await testDb().razorpayOrder.findFirstOrThrow({
          where: { paymentId: refused.payment.id, status: 'CREATED' },
        })
      ).attempt,
    ).toBe(2);
  });

  it('records a verified checkout return once and never marks the payment paid from the browser', async () => {
    const fake = provider();
    const { student, payment, orderId, providerPaymentId } = await paidOrder(fake);
    const path = `student/re-exam-payments/${payment.id}/razorpay-return`;
    const body = {
      razorpay_order_id: orderId,
      razorpay_payment_id: providerPaymentId,
      razorpay_signature: createHmac('sha256', keySecret)
        .update(`${orderId}|${providerPaymentId}`)
        .digest('hex'),
    };
    for (let i = 0; i < 2; i++)
      expect((await expectStatus(studentPost(student.agent, path, body), 200)).body).toEqual({
        status: 'AWAITING_CONFIRMATION',
      });
    await expectStatus(
      studentPost(student.agent, path, { ...body, razorpay_signature: 'b'.repeat(64) }),
      400,
    );
    const other = await newStudent();
    await expectStatus(studentPost(other.agent, path, body), 404);
    const order = await orderRow(orderId);
    expect(order.events.filter((e) => e.kind === 'CHECKOUT_RETURNED')).toHaveLength(1);
    expect(order.status).toBe('CREATED');
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe('AWAITING_PAYMENT');
  });

  it('fulfils exactly once from payment.captured and order.paid, in any order and under concurrency', async () => {
    const fake = provider();
    const { payment, applicationId, orderId, providerPaymentId, due } = await paidOrder(fake);
    const before = await testDb().reExamApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    const capturedId = `evt_${randomUUID()}`;
    const captured = captureEvent('payment.captured', orderId, providerPaymentId, due.amountMinor);
    const paid = captureEvent('order.paid', orderId, providerPaymentId, due.amountMinor);
    const replies = await Promise.all([
      deliver(paid),
      ...Array.from({ length: 9 }, () => deliver(captured, capturedId)),
    ]);
    expect(replies.map((r) => r.status)).toEqual(Array(10).fill(200));
    for (const r of replies) expect(r.body).toEqual({ received: true, attributed: false });
    const order = await orderRow(orderId);
    expect(order.status).toBe('PAID');
    expect(order.providerPaymentId).toBe(providerPaymentId);
    expect(order.events.filter((e) => e.kind === 'PAID')).toHaveLength(1);
    const obligationRow = await testDb().reExamPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(obligationRow).toMatchObject({
      status: 'SUBMITTED',
      transactionReference: providerPaymentId,
      submittedByAccountId: order.studentAccountId,
    });
    expect(
      await testDb().auditLog.count({
        where: { action: 'RAZORPAY_PAYMENT_CAPTURED_MATCHED', entityId: payment.id },
      }),
    ).toBe(1);
    expect(
      await testDb().razorpayWebhookReceipt.count({ where: { providerOrderId: orderId } }),
    ).toBe(2);
    const stored = await testDb().razorpayWebhookReceipt.findMany({
      where: { providerOrderId: orderId },
    });
    expect(JSON.stringify(stored)).not.toMatch(/fictional|\+91|email|contact/);
    expect(
      (await testDb().reExamApplication.findUniqueOrThrow({ where: { id: applicationId } })).status,
    ).toBe(before.status);
    // A later replay of either event changes nothing.
    await expectStatus(deliver(captured, capturedId), 200);
    expect((await orderRow(orderId)).events.filter((e) => e.kind === 'PAID')).toHaveLength(1);
  });

  it('never fulfils on a money, provider-state or obligation mismatch, and retries on provider outages', async () => {
    const fake = provider();
    const { payment, orderId, providerPaymentId, due } = await paidOrder(fake);
    const flags = async () =>
      (await orderRow(orderId)).events
        .filter((e) => e.kind === 'FLAGGED')
        .map((e) => e.reason ?? '')
        .sort();
    await expectStatus(
      deliver(captureEvent('payment.captured', orderId, providerPaymentId, due.amountMinor - 1)),
      200,
    );
    await expectStatus(
      deliver(
        captureEvent('payment.captured', orderId, providerPaymentId, due.amountMinor, {
          currency: 'USD',
        }),
      ),
      200,
    );
    fake.payments.set(providerPaymentId, {
      ...fake.payments.get(providerPaymentId),
      status: 'refunded',
      amount_refunded: due.amountMinor,
    });
    await expectStatus(
      deliver(captureEvent('payment.captured', orderId, providerPaymentId, due.amountMinor)),
      200,
    );
    expect(await flags()).toEqual([
      'AMOUNT_MISMATCH',
      'AMOUNT_MISMATCH',
      'PROVIDER_STATE_MISMATCH',
    ]);
    // authorized is not paid: ignored at classification, so no receipt either.
    const authorizedId = `evt_${randomUUID()}`;
    await expectStatus(
      deliver(
        captureEvent('payment.captured', orderId, providerPaymentId, due.amountMinor, {
          status: 'authorized',
          captured: false,
        }),
        authorizedId,
      ),
      200,
    );
    expect(
      await testDb().razorpayWebhookIgnored.count({
        where: { eventId: authorizedId, reason: 'UNPARSEABLE' },
      }),
    ).toBe(1);
    // An order we never created: stored, not attributed.
    const unknownId = `evt_${randomUUID()}`;
    await expectStatus(
      deliver(
        captureEvent('payment.captured', 'order_NeverCreated', `pay_${rid()}`, due.amountMinor),
        unknownId,
      ),
      200,
    );
    expect(await testDb().razorpayWebhookReceipt.count({ where: { eventId: unknownId } })).toBe(1);
    // Provider unreachable while re-fetching: 503 and nothing stored, so Razorpay retries.
    fake.payments.set(providerPaymentId, {
      ...fake.payments.get(providerPaymentId),
      status: 'captured',
      amount_refunded: 0,
    });
    const outageId = `evt_${randomUUID()}`;
    const fetchFailure = vi
      .spyOn(app.get(RazorpayGatewayService), 'client')
      .mockImplementation(
        () => new RazorpayClient(keyId, keySecret, () => Promise.resolve(reply({}, 503))),
      );
    const good = captureEvent('payment.captured', orderId, providerPaymentId, due.amountMinor);
    await expectStatus(deliver(good, outageId), 503);
    expect(await testDb().razorpayWebhookReceipt.count({ where: { eventId: outageId } })).toBe(0);
    fetchFailure.mockImplementation(() => new RazorpayClient(keyId, keySecret, fake.port));
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe('AWAITING_PAYMENT');
    await expectStatus(deliver(good, outageId), 200);
    expect((await orderRow(orderId)).status).toBe('PAID');

    // A capture against a voided obligation is a refund candidate, never a silent success.
    const voided = await paidOrder(fake);
    await testDb().reExamPayment.update({
      where: { id: voided.payment.id },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: 'SYNTHETIC_TEST' },
    });
    await expectStatus(
      deliver(
        captureEvent(
          'order.paid',
          voided.orderId,
          voided.providerPaymentId,
          voided.due.amountMinor,
        ),
      ),
      200,
    );
    expect((await orderRow(voided.orderId)).status).toBe('CREATED');
    const flagged = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'RAZORPAY_PAYMENT_CAPTURE_FLAGGED', entityId: voided.payment.id },
    });
    expect(flagged.metadata).toMatchObject({
      reason: 'OBLIGATION_NOT_OPEN',
      refundCandidate: true,
    });
  });

  it('in a test-mode app (real runtime config): unused signed events get 2xx, any content type is read raw, only unverified requests are rate limited', async () => {
    // Policy from validated-shape runtime configuration, not a spy; secrets are synthetic.
    const testApp = await createTestApp(
      realConfig({
        PAYMENTS_RAZORPAY_MODE: 'test',
        DOCVERSITY_DEPLOYMENT: 'ci-synthetic',
        PAYMENTS_ALLOWED_DEPLOYMENT: 'ci-synthetic',
        RAZORPAY_KEY_ID: keyId,
        RAZORPAY_KEY_SECRET: keySecret,
        RAZORPAY_WEBHOOK_SECRET: secret,
        RAZORPAY_ACCOUNT_ID: merchant,
        PAYMENTS_TEST_REGISTRATION_ALLOWLIST: [randomUUID()],
      }),
    );
    try {
      const fake = provider();
      vi.spyOn(testApp.get(RazorpayGatewayService), 'client').mockImplementation(
        () => new RazorpayClient(keyId, keySecret, fake.port),
      );
      expect(testApp.get(PaymentButtonPolicyService).fixture()).toMatchObject({
        mode: 'TEST',
        merchantId: merchant,
      });
      const send = (
        body: string | Buffer,
        type = 'application/json',
        eventId = `evt_${randomUUID()}`,
      ) => signed(body, eventId, type, testApp);
      const refundId = `evt_${randomUUID()}`;
      const refund = {
        entity: 'event',
        account_id: merchant,
        event: 'payment.dispute.created',
        created_at: Math.floor(Date.now() / 1000),
        payload: { dispute: { entity: { id: 'disp_Synthetic', notes: { x: 'y' } } } },
      };
      await expectStatus(send(JSON.stringify(refund), 'application/json', refundId), 200);
      const ignored = await testDb().razorpayWebhookIgnored.findFirstOrThrow({
        where: { eventId: refundId },
      });
      expect(ignored).toMatchObject({
        reason: 'UNHANDLED_EVENT',
        eventType: 'payment.dispute.created',
      });
      expect(JSON.stringify(ignored)).not.toContain('disp_Synthetic');
      expect(
        await testDb().auditLog.count({
          where: { action: 'RAZORPAY_WEBHOOK_IGNORED', entityId: ignored.id },
        }),
      ).toBe(1);
      expect(await testDb().razorpayWebhookReceipt.count({ where: { eventId: refundId } })).toBe(0);
      await expectStatus(
        send(JSON.stringify({ ...refund, event: 'payment.dispute.created' }), 'text/plain'),
        200,
      );
      await expectStatus(send('not json at all', 'application/x-www-form-urlencoded'), 200);
      expect((await send(Buffer.alloc(70_000, 'a'), 'text/plain')).status).toBe(413);
      for (let i = 0; i < 70; i++)
        await expectStatus(
          send(JSON.stringify({ ...refund, event: 'payment.downtime.started' })),
          200,
        );
      const statuses: number[] = [];
      for (let i = 0; i < 61; i++)
        statuses.push(
          (
            await browser(testApp)
              .post('/api/v1/payment-buttons/webhook')
              .set('Content-Type', 'application/json')
              .set('X-Razorpay-Signature', 'c'.repeat(64))
              .set('X-Razorpay-Event-Id', `evt_${randomUUID()}`)
              .send('{}')
          ).status,
        );
      expect(statuses[0]).toBe(400);
      expect(statuses.at(-1)).toBe(429);
      // Verified deliveries are still answered while unverified ones are throttled.
      await expectStatus(send(JSON.stringify(refund)), 200);
      // Alert hooks: a signed other-account event and a digest conflict both alert, still 2xx.
      const alerts = vi.spyOn(testApp.get(PaymentAlertsService), 'notify');
      await expectStatus(send(JSON.stringify({ ...refund, account_id: 'acc_SomeoneElse' })), 200);
      const conflictId = `evt_${randomUUID()}`;
      await expectStatus(send(JSON.stringify(refund), 'application/json', conflictId), 200);
      await expectStatus(
        send(JSON.stringify({ ...refund, created_at: 1 }), 'application/json', conflictId),
        200,
      );
      expect(alerts.mock.calls.map(([alert]) => alert.kind)).toEqual([
        'WEBHOOK_ACCOUNT_MISMATCH',
        'WEBHOOK_DIGEST_CONFLICT',
      ]);
      expect(fake.calls).toHaveLength(0);
    } finally {
      await testApp.close();
    }
  });
  it('closes stale open orders: on create re-check, manual submission, void and expiry', async () => {
    const fake = provider();
    const abandoned = async (orderId: string) => {
      const row = await orderRow(orderId);
      return { status: row.status, reason: row.events.find((e) => e.kind === 'ABANDONED')?.reason };
    };
    // Obligation closed without our hooks: the next create closes the open order and refuses.
    const a = await paidOrder(fake);
    await testDb().reExamPayment.update({
      where: { id: a.payment.id },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: 'SYNTHETIC_TEST' },
    });
    await expectStatus(createOrder(a.student.agent, a.payment.id), 409);
    expect(await abandoned(a.orderId)).toEqual({
      status: 'ABANDONED',
      reason: 'OBLIGATION_NOT_OPEN',
    });
    // A capture on an abandoned order is a refund candidate and alerts.
    const alerts = vi.spyOn(app.get(PaymentAlertsService), 'notify');
    await expectStatus(
      deliver(captureEvent('payment.captured', a.orderId, a.providerPaymentId, a.due.amountMinor)),
      200,
    );
    expect(alerts.mock.calls.map(([alert]) => alert)).toContainEqual({
      kind: 'CAPTURE_FLAGGED',
      severity: 'critical',
      details: {
        receiptId: expect.any(String) as string,
        reason: 'ORDER_NOT_OPEN',
        refundCandidate: true,
      },
    });
    // Manual submission and a region change (void) close the open order in the same transaction.
    const b = await paidOrder(fake);
    await expectStatus(submit(b.student.agent, b.payment.id, `UTR${rid()}`), 200);
    expect(await abandoned(b.orderId)).toEqual({
      status: 'ABANDONED',
      reason: 'MANUALLY_SUBMITTED',
    });
    const c = await paidOrder(fake);
    await publish('NEPAL');
    await expectStatus(start(c.student.agent, c.applicationId, 'NEPAL'), 200);
    expect(await abandoned(c.orderId)).toEqual({
      status: 'ABANDONED',
      reason: 'OBLIGATION_VOIDED',
    });
    // An expired unpaid order is replaced by a new attempt instead of being offered forever.
    const d = await paidOrder(fake);
    const service = app.get(RazorpayOrdersService);
    service.orderTtlMs = 0;
    try {
      const next = razorpayOrderViewSchema.parse(
        (await expectStatus(createOrder(d.student.agent, d.payment.id), 200)).body,
      );
      expect(next.orderId).not.toBe(d.orderId);
    } finally {
      service.orderTtlMs = 30 * 60_000;
    }
    expect(await abandoned(d.orderId)).toEqual({ status: 'ABANDONED', reason: 'EXPIRED' });
    expect((await orderRow(fake.orders.at(-1)?.id ?? '')).attempt).toBe(2);
  });

  it('shows staff which submitted payments came from a Razorpay test capture', async () => {
    const fake = provider();
    const p = await paidOrder(fake);
    await expectStatus(
      deliver(captureEvent('order.paid', p.orderId, p.providerPaymentId, p.due.amountMinor)),
      200,
    );
    const viaRazorpay = reExamPaymentDetailSchema.parse(
      (await approver.get(`re-exam-payments/${p.payment.id}`).expect(200)).body,
    );
    expect(viaRazorpay).toMatchObject({ status: 'SUBMITTED', providerSource: 'RAZORPAY_TEST' });
    const manual = await obligation();
    await expectStatus(submit(manual.student.agent, manual.payment.id, `UTR${rid()}`), 200);
    const byHand = reExamPaymentDetailSchema.parse(
      (await approver.get(`re-exam-payments/${manual.payment.id}`).expect(200)).body,
    );
    expect(byHand.providerSource).toBe('MANUAL');
  });

  it('retries malformed provider answers, re-matches PROVIDER_UNVERIFIED by reconciliation, and alerts on drift', async () => {
    const fake = provider();
    const p = await paidOrder(fake);
    const event = captureEvent(
      'payment.captured',
      p.orderId,
      p.providerPaymentId,
      p.due.amountMinor,
    );
    const eventId = `evt_${randomUUID()}`;
    fake.malformedFetches(true);
    await expectStatus(deliver(event, eventId), 503);
    expect(await testDb().razorpayWebhookReceipt.count({ where: { eventId } })).toBe(0);
    fake.malformedFetches(false);
    // A definite refusal (the provider does not know the payment) flags, but is not final.
    const saved = fake.payments.get(p.providerPaymentId) ?? {};
    fake.payments.delete(p.providerPaymentId);
    await expectStatus(deliver(event, eventId), 200);
    const flagged = await orderRow(p.orderId);
    expect(flagged.status).toBe('CREATED');
    expect(flagged.events.filter((e) => e.kind === 'FLAGGED').map((e) => e.reason)).toEqual([
      'PROVIDER_UNVERIFIED',
    ]);
    // A replay of a known event id never reaches the provider.
    const fetchesBefore = fake.calls.filter((c) => c.path.startsWith('/payments/')).length;
    await expectStatus(deliver(event, eventId), 200);
    expect(fake.calls.filter((c) => c.path.startsWith('/payments/')).length).toBe(fetchesBefore);

    fake.payments.set(p.providerPaymentId, saved);
    const reconciliation = app.get(RazorpayReconciliationService);
    const first = await reconciliation.run();
    expect(first.rematched).toBeGreaterThanOrEqual(1);
    expect(first.settlement).toBe('EMPTY');
    const paid = await orderRow(p.orderId);
    expect(paid.status).toBe('PAID');
    expect(
      (await testDb().reExamPayment.findUniqueOrThrow({ where: { id: p.payment.id } })).status,
    ).toBe('SUBMITTED');

    fake.payments.set(p.providerPaymentId, {
      ...saved,
      status: 'refunded',
      amount_refunded: p.due.amountMinor,
    });
    const alerts = vi.spyOn(app.get(PaymentAlertsService), 'notify');
    const second = await reconciliation.run();
    expect(second.issues.filter((issue) => issue.orderId === paid.id)).toEqual([
      {
        code: 'PAID_ORDER_DRIFT',
        orderId: paid.id,
        providerPaymentId: p.providerPaymentId,
        driftMinor: p.due.amountMinor,
      },
    ]);
    expect(alerts.mock.calls.some(([alert]) => alert.kind === 'RECONCILIATION_ISSUES')).toBe(true);
    expect(
      await testDb().auditLog.count({ where: { action: 'RAZORPAY_RECONCILIATION_RUN' } }),
    ).toBeGreaterThanOrEqual(2);
  });
});
