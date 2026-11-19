import { Injectable, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  classifyRazorpayEvent,
  isRazorpayEventId,
  razorpaySignatureMatches,
  type RazorpayIgnoreReason,
} from '@docversity/payments';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  type PaymentButtonView,
  type ReconcileRazorpayPayment,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { AppError, Errors } from '../common/app-error.js';
import { PaymentButtonPolicyService } from './payment-button-policy.service.js';
import { RazorpayOrdersService } from './razorpay-orders.service.js';
const conflict = () =>
  new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.conflict,
    'Payment evidence is unavailable, already allocated, or does not match this application.',
  );
const unavailable = (
  service: PaymentButtonView['service'],
  applicationId: string,
  reason: string,
): PaymentButtonView => ({
  service,
  applicationId,
  paymentId: null,
  status: 'UNAVAILABLE',
  unavailableReason: reason,
  certificateFeeScope: 'HARD_COPY_ONLY',
  checkout: null,
  liveTransactionsEnabled: false,
  qrFallbackEnabled: false,
});
@Injectable()
export class PaymentButtonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PaymentButtonPolicyService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
    private readonly orders: RazorpayOrdersService,
  ) {}

  async exam(studentId: string, registrationId: string, examinationId: string) {
    const registration = await this.prisma.client.studentRegistration.findFirst({
      where: { id: registrationId, studentId },
    });
    const exam = registration?.curriculumId
      ? await this.prisma.client.examination.findFirst({
          where: { id: examinationId, curriculumId: registration.curriculumId, kind: 'REGULAR' },
        })
      : null;
    if (!exam) throw Errors.notFound();
    return unavailable(
      'EXAM',
      exam.id,
      'Online exam fee payment is not available. An approved examination fee obligation and merchant configuration are required.',
    );
  }
  async certificate(studentId: string, id: string) {
    const request = await this.prisma.client.certificateRequest.findFirst({
      where: { id, studentId },
    });
    if (!request) throw Errors.notFound();
    return unavailable(
      'CERTIFICATE_HARD_COPY',
      id,
      'The certificate fee applies only to hard copies. Hard-copy delivery and fee eligibility are not configured; digital and SAMPLE certificates are not payable here.',
    );
  }
  async reExam(studentId: string, id: string): Promise<PaymentButtonView> {
    const app = await this.prisma.client.reExamApplication.findFirst({
      where: { id, studentId },
      include: {
        payments: { where: { status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!app) throw Errors.notFound();
    const payment = app.payments[0];
    const view = unavailable(
      'RE_EXAM',
      id,
      'Online payment collection is disabled pending university authorization and verified merchant settings.',
    );
    if (!payment) return view;
    view.paymentId = payment.id;
    view.status =
      payment.status === 'VERIFIED'
        ? 'PAID'
        : payment.status === 'SUBMITTED'
          ? 'AWAITING_VERIFICATION'
          : payment.status === 'REJECTED'
            ? 'FAILED'
            : 'PENDING';
    // Test-mode collection uses the Orders API (POST student/re-exam-payments/:id/razorpay-order);
    // the code-held Payment Button fixture is gone, so this panel never embeds a button.
    return view;
  }
  async webhook(raw: unknown, signature: unknown, eventId: unknown, ip: string) {
    // Mode off: 404 before any rate limiting, verification or database access (unchanged).
    const policy = this.policy.requireFixture();
    if (
      !isRazorpayEventId(eventId) ||
      !razorpaySignatureMatches(raw, signature, policy.webhookSecret)
    ) {
      // Only unverified requests are rate limited: a verified delivery is never answered 429.
      const rate = await this.limiter.hit(
        'razorpay-webhook',
        [{ key: this.hasher.hash('razorpay-webhook', ip), limit: 60 }],
        60,
      );
      if (rate.limited) throw Errors.rateLimited(rate.retryAfterSeconds);
      throw Errors.validation([
        { path: 'webhook', message: 'Payment notification could not be verified.' },
      ]);
    }
    const event = classifyRazorpayEvent(raw, eventId, policy.merchantId);
    const summary =
      event.outcome === 'HANDLED'
        ? {
            eventId,
            eventType: event.evidence.eventType,
            bodySha256: event.evidence.bodySha256,
            providerCreatedAt: event.evidence.providerCreatedAt,
          }
        : {
            eventId,
            eventType: event.eventType,
            bodySha256: event.bodySha256,
            providerCreatedAt: event.providerCreatedAt,
          };
    // Re-fetch the current payment before acting on an order-bound capture (never trust event order).
    const current =
      event.outcome === 'HANDLED' ? await this.orders.currentPayment(event.evidence) : null;
    // From here on the body is authentic: every outcome is 2xx unless our own storage fails (5xx).
    await this.prisma.client.$transaction(async (tx) => {
      // The header is not signed: bind it to the original body, and never attribute from this header.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      const priorDigest =
        (await tx.razorpayWebhookReceipt.findUnique({ where: { eventId } }))?.bodySha256 ??
        (
          await tx.razorpayWebhookIgnored.findFirst({
            where: { eventId, reason: { not: 'DIGEST_CONFLICT' } },
          })
        )?.bodySha256;
      if (priorDigest === summary.bodySha256) return; // replay: no side effect
      // Same id, different signed body: authentic, so never 4xx (24 h of 4xx disables the webhook).
      if (priorDigest !== undefined)
        return this.ignore(tx, { ...summary, reason: 'DIGEST_CONFLICT' });
      if (event.outcome === 'IGNORED') return this.ignore(tx, { ...summary, reason: event.reason });
      const receipt = await tx.razorpayWebhookReceipt.create({
        data: { id: randomUUID(), ...event.evidence },
      });
      const match =
        event.evidence.captured && event.evidence.providerOrderId
          ? await this.orders.matchCapture(tx, receipt, current)
          : null;
      await this.audit.writeAuditEvent(
        {
          action: AUDIT_ACTIONS.razorpayWebhookReceived,
          entityType: 'RazorpayWebhookReceipt',
          entityId: receipt.id,
          metadata: {
            eventType: event.evidence.eventType,
            automaticallyAttributed: match?.matched ?? false,
            ...(match && !match.matched ? { reason: match.reason } : {}),
          },
        },
        tx,
      );
    });
    // Identical body for every verified outcome, so responses reveal nothing about matching.
    return { received: true, attributed: false } as const;
  }
  private async ignore(
    tx: Prisma.TransactionClient,
    row: {
      eventId: string;
      eventType: string | null;
      bodySha256: string;
      providerCreatedAt: Date | null;
      reason: RazorpayIgnoreReason | 'DIGEST_CONFLICT';
    },
  ) {
    const ignored = await tx.razorpayWebhookIgnored.create({ data: row });
    await this.audit.writeAuditEvent(
      {
        action: AUDIT_ACTIONS.razorpayWebhookIgnored,
        entityType: 'RazorpayWebhookIgnored',
        entityId: ignored.id,
        metadata: { eventType: row.eventType, reason: row.reason },
      },
      tx,
    );
  }
  async receipts(id: string) {
    const payment = await this.prisma.client.reExamPayment.findUnique({
      where: { id },
      include: { application: true },
    });
    if (!payment) throw Errors.notFound();
    const fixture = this.policy.fixture();
    if (
      !fixture?.registrationIds.includes(payment.application.studentRegistrationId) ||
      !payment.transactionReference
    )
      return { data: [], reconciliationAvailable: false };
    const data = await this.prisma.client.razorpayWebhookReceipt.findMany({
      where: { providerPaymentId: payment.transactionReference, merchantId: fixture.merchantId },
      select: {
        id: true,
        eventType: true,
        amountMinor: true,
        currency: true,
        captured: true,
        amountRefunded: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { data, reconciliationAvailable: true };
  }
  async reconcile(body: ReconcileRazorpayPayment, actorUserId: string) {
    const fixture = this.policy.requireFixture();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM re_exam_payments WHERE id=${body.paymentId}::uuid FOR UPDATE`;
      const payment = await tx.reExamPayment.findUnique({
        where: { id: body.paymentId },
        include: { application: true },
      });
      if (!payment || !fixture.registrationIds.includes(payment.application.studentRegistrationId))
        throw Errors.notFound();
      const receipt = await tx.razorpayWebhookReceipt.findUnique({ where: { id: body.receiptId } });
      const reportHash = this.hasher.hash('razorpay-report', body.reportReference);
      const prior = await tx.razorpayReconciliation.findUnique({
        where: { paymentId: payment.id },
      });
      if (prior) {
        if (
          prior.receiptId !== body.receiptId ||
          prior.buttonId !== body.buttonId ||
          prior.reportReferenceHash !== reportHash ||
          prior.actorUserId !== actorUserId
        )
          throw conflict();
        return { paymentId: payment.id, status: 'PAID', liveTransactionsEnabled: false };
      }
      if (
        receipt?.merchantId !== fixture.merchantId ||
        !receipt.captured ||
        receipt.eventType !== 'payment.captured' ||
        receipt.amountRefunded !== 0 ||
        receipt.amountMinor !== payment.amountMinor ||
        receipt.currency !== payment.currency ||
        payment.status !== 'SUBMITTED' ||
        payment.transactionReference !== receipt.providerPaymentId ||
        payment.application.feeStatus !== 'ASSESSED' ||
        ['CANCELLED', 'REJECTED'].includes(payment.application.status)
      )
        throw conflict();
      // Lock all events for this provider payment, including differently named duplicate events.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${receipt.providerPaymentId}))`;
      const allocated = await tx.razorpayReconciliation.findUnique({
        where: { providerPaymentId: receipt.providerPaymentId },
      });
      if (allocated) throw conflict();
      await tx.razorpayReconciliation.create({
        data: {
          receiptId: receipt.id,
          paymentId: payment.id,
          providerPaymentId: receipt.providerPaymentId,
          buttonId: body.buttonId,
          reportReferenceHash: reportHash,
          actorUserId,
        },
      });
      await tx.reExamPayment.update({
        where: { id: payment.id },
        data: {
          status: 'VERIFIED',
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          verifiedAmountMinor: receipt.amountMinor,
          verifiedCurrency: receipt.currency,
          reviewNote: 'Provider report and student ownership manually reconciled (synthetic test).',
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.razorpayPaymentReconciled,
          entityType: 'ReExamPayment',
          entityId: payment.id,
          metadata: {
            receiptId: receipt.id,
            buttonId: body.buttonId,
            confirmedAgainstProviderRecords: true,
            confirmedStudentOwnership: true,
            financialActivationAllowed: false,
          },
        },
        tx,
      );
      return { paymentId: payment.id, status: 'PAID', liveTransactionsEnabled: false };
    });
  }
}
