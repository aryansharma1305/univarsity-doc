import { Injectable, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { verifyRazorpayWebhook } from '@docversity/payments';
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
import { isUsable } from '../re-exams/payment-destinations.service.js';
import { PaymentButtonPolicyService } from './payment-button-policy.service.js';
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
    const fixture = this.policy.fixture();
    const destination = await this.prisma.client.reExamPaymentDestination.findUnique({
      where: { id: payment.destinationId },
    });
    if (
      fixture?.registrationIds.includes(app.studentRegistrationId) &&
      payment.status === 'AWAITING_PAYMENT' &&
      app.feeStatus === 'ASSESSED' &&
      !['CANCELLED', 'REJECTED'].includes(app.status) &&
      destination &&
      isUsable(destination)
    ) {
      view.checkout = { mode: 'TEST', buttonId: fixture.reExamTestButtonId };
      view.unavailableReason = null;
    }
    return view;
  }
  async webhook(raw: Buffer, signature: unknown, eventId: unknown, ip: string) {
    const fixture = this.policy.requireFixture();
    const rate = await this.limiter.hit(
      'razorpay-webhook',
      [{ key: this.hasher.hash('razorpay-webhook', ip), limit: 60 }],
      60,
    );
    if (rate.limited) throw Errors.rateLimited(rate.retryAfterSeconds);
    let event;
    try {
      event = verifyRazorpayWebhook(
        raw,
        signature,
        eventId,
        fixture.webhookSecret,
        fixture.merchantId,
      );
    } catch {
      throw Errors.validation([
        { path: 'webhook', message: 'Payment notification could not be verified.' },
      ]);
    }
    return this.prisma.client.$transaction(async (tx) => {
      // The header is not signed: bind it to the original body, and never attribute from this header.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.eventId}))`;
      const prior = await tx.razorpayWebhookReceipt.findUnique({
        where: { eventId: event.eventId },
      });
      if (prior) {
        if (prior.bodySha256 !== event.bodySha256) throw conflict();
        return { received: true, attributed: false };
      }
      const receipt = await tx.razorpayWebhookReceipt.create({
        data: { id: randomUUID(), ...event },
      });
      await this.audit.writeAuditEvent(
        {
          action: AUDIT_ACTIONS.razorpayWebhookReceived,
          entityType: 'RazorpayWebhookReceipt',
          entityId: receipt.id,
          metadata: { eventType: event.eventType, automaticallyAttributed: false },
        },
        tx,
      );
      return { received: true, attributed: false };
    });
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
