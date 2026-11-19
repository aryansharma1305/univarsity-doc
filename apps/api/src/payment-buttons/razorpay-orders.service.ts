import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import {
  RazorpayApiError,
  razorpayOrderReceipt,
  verifyRazorpayCheckoutSignature,
  type RazorpayEvidence,
  type RazorpayPayment,
} from '@docversity/payments';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  normalizeTransactionReference,
  type RazorpayCheckoutReturn,
  type RazorpayOrderView,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { isUsable } from '../re-exams/payment-destinations.service.js';
import {
  PaymentButtonPolicyService,
  RazorpayGatewayService,
} from './payment-button-policy.service.js';

const providerUnavailable = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_CODES.paymentProviderUnavailable,
    'The payment provider is temporarily unavailable. Nothing was charged; please try again shortly.',
  );
const notPayable = () =>
  new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.conflict,
    'This payment cannot be paid online now.',
  );
/** Captures that reached a closed obligation or a paid order: money arrived that must go back. */
const REFUND_CANDIDATE = new Set([
  'OBLIGATION_NOT_OPEN',
  'ORDER_ALREADY_PAID',
  'PAYMENT_ALREADY_USED',
]);

type CurrentPayment = RazorpayPayment | 'UNVERIFIABLE' | null;
export type CaptureMatch = { matched: true } | { matched: false; reason: string };
type ObligationForCheckout = Prisma.ReExamPaymentGetPayload<{
  include: { application: true; destination: true };
}>;

function payable(p: ObligationForCheckout | null): p is ObligationForCheckout {
  return (
    p?.status === 'AWAITING_PAYMENT' &&
    p.application.feeStatus === 'ASSESSED' &&
    !['CANCELLED', 'REJECTED'].includes(p.application.status) &&
    isUsable(p.destination) &&
    p.amountMinor >= 100
  );
}

/**
 * Test-mode Orders API checkout for Phase 9C re-exam obligations. The amount and currency always
 * come from the server-side obligation snapshot; the browser supplies only which obligation.
 * A matched, signed capture moves the obligation to SUBMITTED with the provider payment id as its
 * reference; VERIFIED stays a staff decision (the existing Phase 9C verify step).
 */
@Injectable()
export class RazorpayOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PaymentButtonPolicyService,
    private readonly gateway: RazorpayGatewayService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
  ) {}

  private async throttle(scope: string, accountId: string, limit: number) {
    const rate = await this.limiter.hit(scope, [{ key: `account:${accountId}`, limit }], 60);
    if (rate.limited) throw Errors.rateLimited(rate.retryAfterSeconds);
  }

  async create(
    studentId: string,
    accountId: string,
    paymentId: string,
  ): Promise<RazorpayOrderView> {
    const policy = this.policy.requireFixture();
    await this.throttle('razorpay-order', accountId, 5);
    const owned = await this.prisma.client.reExamPayment.findFirst({
      where: { id: paymentId, studentId },
      include: { application: true },
    });
    if (!owned || !policy.registrationIds.includes(owned.application.studentRegistrationId))
      throw Errors.notFound();
    const view = (o: {
      providerOrderId: string | null;
      amountMinor: number;
      currency: string;
    }) => ({
      orderId: o.providerOrderId ?? '',
      keyId: policy.keyId,
      amountMinor: o.amountMinor,
      currency: o.currency,
      mode: 'TEST' as const,
    });

    // 1. Reserve (committed before any provider call), one open order per obligation.
    const reserved = await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM re_exam_payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const open = await tx.razorpayOrder.findFirst({
        where: { paymentId, status: { in: ['RESERVED', 'CREATED'] } },
      });
      if (open) return open;
      const locked = await tx.reExamPayment.findUnique({
        where: { id: paymentId },
        include: { application: true, destination: true },
      });
      if (!payable(locked)) throw notPayable();
      const last = await tx.razorpayOrder.aggregate({
        where: { paymentId },
        _max: { attempt: true },
      });
      const attempt = (last._max.attempt ?? 0) + 1;
      if (attempt > 99) throw notPayable();
      const order = await tx.razorpayOrder.create({
        data: {
          paymentId,
          attempt,
          receipt: razorpayOrderReceipt(paymentId, attempt),
          mode: 'TEST',
          accountId: policy.merchantId,
          amountMinor: locked.amountMinor,
          currency: locked.currency,
          studentAccountId: accountId,
        },
      });
      await tx.razorpayOrderEvent.create({ data: { orderId: order.id, kind: 'RESERVED' } });
      return order;
    });
    if (reserved.status === 'CREATED') return view(reserved);

    // 2. Create at Razorpay while holding the order row, so concurrent requests wait for one create.
    const client = this.gateway.client();
    const state: { failure: string | null } = { failure: null };
    try {
      const created = await this.prisma.client.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE id = ${reserved.id}::uuid FOR UPDATE`;
          const row = await tx.razorpayOrder.findUniqueOrThrow({ where: { id: reserved.id } });
          if (row.status !== 'RESERVED') return row;
          const obligation = await tx.reExamPayment.findUnique({
            where: { id: paymentId },
            include: { application: true, destination: true },
          });
          if (!payable(obligation)) {
            state.failure = 'OBLIGATION_NOT_OPEN';
            throw notPayable();
          }
          // A crash after an earlier create leaves RESERVED: find that order before creating again.
          const remote =
            (await client.findOrdersByReceipt(row.receipt))[0] ??
            (await client.createOrder({
              amountMinor: row.amountMinor,
              currency: row.currency,
              receipt: row.receipt,
              notes: { obligation_id: row.paymentId, attempt: String(row.attempt), mode: 'TEST' },
            }));
          if (remote.amount !== row.amountMinor || remote.currency !== row.currency) {
            state.failure = 'AMOUNT_MISMATCH';
            throw providerUnavailable();
          }
          const updated = await tx.razorpayOrder.update({
            where: { id: row.id },
            data: { status: 'CREATED', providerOrderId: remote.id },
          });
          await tx.razorpayOrderEvent.create({ data: { orderId: row.id, kind: 'CREATED' } });
          await this.audit.writeAuditEvent(
            {
              action: AUDIT_ACTIONS.razorpayOrderCreated,
              entityType: 'RazorpayOrder',
              entityId: row.id,
              metadata: {
                principal: 'student',
                accountId,
                paymentId,
                attempt: row.attempt,
                amountMinor: row.amountMinor,
                currency: row.currency,
                mode: 'TEST',
              },
            },
            tx,
          );
          return updated;
        },
        { timeout: 20_000, maxWait: 20_000 },
      );
      return view(created);
    } catch (error) {
      if (error instanceof RazorpayApiError) {
        // Transient (or "duplicate receipt", which the next lookup resolves): keep RESERVED.
        if (!error.transient && error.code !== 'DUPLICATE_RECEIPT') state.failure = error.code;
        if (state.failure) await this.fail(reserved.id, state.failure);
        throw providerUnavailable();
      }
      if (state.failure) await this.fail(reserved.id, state.failure);
      throw error;
    }
  }

  private async fail(orderId: string, reason: string) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const row = await tx.razorpayOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (row.status !== 'RESERVED') return;
      await tx.razorpayOrder.update({ where: { id: orderId }, data: { status: 'CREATE_FAILED' } });
      await tx.razorpayOrderEvent.create({ data: { orderId, kind: 'CREATE_FAILED', reason } });
    });
  }

  /** Browser return from Checkout: checks the handler HMAC and records it. Never marks paid. */
  async checkoutReturn(
    studentId: string,
    accountId: string,
    paymentId: string,
    body: RazorpayCheckoutReturn,
  ) {
    const policy = this.policy.requireFixture();
    await this.throttle('razorpay-checkout-return', accountId, 20);
    const order = await this.prisma.client.razorpayOrder.findFirst({
      where: { paymentId, providerOrderId: body.razorpay_order_id, payment: { studentId } },
    });
    if (!order?.providerOrderId) throw Errors.notFound();
    if (
      !verifyRazorpayCheckoutSignature(
        order.providerOrderId,
        body.razorpay_payment_id,
        body.razorpay_signature,
        policy.keySecret,
      )
    )
      throw Errors.validation([
        { path: 'razorpay_signature', message: 'The payment response could not be verified.' },
      ]);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`razorpay-return:${order.id}`}))`;
      const seen = await tx.razorpayOrderEvent.findFirst({
        where: {
          orderId: order.id,
          kind: 'CHECKOUT_RETURNED',
          providerPaymentId: body.razorpay_payment_id,
        },
      });
      if (!seen)
        await tx.razorpayOrderEvent.create({
          data: {
            orderId: order.id,
            kind: 'CHECKOUT_RETURNED',
            providerPaymentId: body.razorpay_payment_id,
          },
        });
    });
    return { status: 'AWAITING_CONFIRMATION' as const };
  }

  /**
   * Current provider state of an order-bound capture, fetched before acting (events can arrive out
   * of order or describe a payment refunded since). Transient failures become 503 so Razorpay
   * retries; a definite refusal is recorded as unverifiable and never fulfils.
   */
  async currentPayment(evidence: RazorpayEvidence): Promise<CurrentPayment> {
    if (!evidence.captured || !evidence.providerOrderId) return null;
    const known = await this.prisma.client.razorpayOrder.findUnique({
      where: { providerOrderId: evidence.providerOrderId },
      select: { id: true },
    });
    if (!known) return null;
    try {
      return await this.gateway.client().fetchPayment(evidence.providerPaymentId);
    } catch (error) {
      if (error instanceof RazorpayApiError && !error.transient) return 'UNVERIFIABLE';
      throw providerUnavailable();
    }
  }

  /** Binds a signed capture to its order and obligation when every money check holds. */
  async matchCapture(
    tx: Prisma.TransactionClient,
    receipt: { id: string; providerOrderId: string | null; providerPaymentId: string } & Pick<
      RazorpayEvidence,
      'merchantId' | 'amountMinor' | 'currency' | 'captured' | 'amountRefunded'
    >,
    current: CurrentPayment,
  ): Promise<CaptureMatch> {
    if (!receipt.providerOrderId) return { matched: false, reason: 'NO_ORDER' };
    await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE provider_order_id = ${receipt.providerOrderId} FOR UPDATE`;
    const order = await tx.razorpayOrder.findUnique({
      where: { providerOrderId: receipt.providerOrderId },
    });
    if (!order) return { matched: false, reason: 'UNKNOWN_ORDER' };
    // payment.captured and order.paid describe the same capture: the second one is a no-op.
    if (order.status === 'PAID' && order.providerPaymentId === receipt.providerPaymentId)
      return { matched: true };
    await tx.$queryRaw`SELECT id FROM re_exam_payments WHERE id = ${order.paymentId}::uuid FOR UPDATE`;
    const obligation = await tx.reExamPayment.findUniqueOrThrow({
      where: { id: order.paymentId },
      include: { application: true },
    });
    const reference = normalizeTransactionReference(receipt.providerPaymentId);
    const reused =
      reference.length >= 6 &&
      (await tx.reExamPayment.findFirst({
        where: {
          transactionReferenceNormalized: reference,
          status: { in: ['SUBMITTED', 'VERIFIED'] },
        },
        select: { id: true },
      }));
    const exact = (amount: number, currency: string) =>
      amount === order.amountMinor &&
      currency === order.currency &&
      amount === obligation.amountMinor &&
      currency === obligation.currency;
    const reason =
      order.status === 'PAID'
        ? 'ORDER_ALREADY_PAID'
        : order.status !== 'CREATED'
          ? 'ORDER_NOT_OPEN'
          : order.mode !== 'TEST' || order.accountId !== receipt.merchantId
            ? 'ACCOUNT_MISMATCH'
            : !exact(receipt.amountMinor, receipt.currency)
              ? 'AMOUNT_MISMATCH'
              : !receipt.captured || receipt.amountRefunded !== 0
                ? 'NOT_CAPTURED'
                : current === null || current === 'UNVERIFIABLE'
                  ? 'PROVIDER_UNVERIFIED'
                  : current.id !== receipt.providerPaymentId ||
                      current.order_id !== order.providerOrderId ||
                      current.status !== 'captured' ||
                      !current.captured ||
                      current.amount_refunded !== 0 ||
                      !exact(current.amount, current.currency)
                    ? 'PROVIDER_STATE_MISMATCH'
                    : obligation.status !== 'AWAITING_PAYMENT' ||
                        obligation.application.feeStatus !== 'ASSESSED' ||
                        ['CANCELLED', 'REJECTED'].includes(obligation.application.status)
                      ? 'OBLIGATION_NOT_OPEN'
                      : reference.length < 6
                        ? 'UNUSABLE_REFERENCE'
                        : reused
                          ? 'PAYMENT_ALREADY_USED'
                          : null;
    if (reason) {
      await tx.razorpayOrderEvent.create({
        data: {
          orderId: order.id,
          kind: 'FLAGGED',
          reason,
          receiptId: receipt.id,
          providerPaymentId: receipt.providerPaymentId,
        },
      });
      await this.audit.writeAuditEvent(
        {
          action: AUDIT_ACTIONS.razorpayPaymentCaptureFlagged,
          entityType: 'ReExamPayment',
          entityId: order.paymentId,
          metadata: {
            receiptId: receipt.id,
            orderId: order.id,
            reason,
            refundCandidate: REFUND_CANDIDATE.has(reason),
            mode: 'TEST',
          },
        },
        tx,
      );
      return { matched: false, reason };
    }
    await tx.razorpayOrder.update({
      where: { id: order.id },
      data: { status: 'PAID', providerPaymentId: receipt.providerPaymentId },
    });
    await tx.razorpayOrderEvent.create({
      data: {
        orderId: order.id,
        kind: 'PAID',
        receiptId: receipt.id,
        providerPaymentId: receipt.providerPaymentId,
      },
    });
    // AWAITING_PAYMENT → SUBMITTED, exactly as a student submission, but with the signed,
    // re-fetched provider payment id as the reference. Staff still verify (Phase 9C).
    await tx.reExamPayment.update({
      where: { id: obligation.id },
      data: {
        status: 'SUBMITTED',
        transactionReference: receipt.providerPaymentId,
        transactionReferenceNormalized: reference,
        submittedAt: new Date(),
        submittedByAccountId: order.studentAccountId,
      },
    });
    await this.audit.writeAuditEvent(
      {
        action: AUDIT_ACTIONS.reExamPaymentSubmitted,
        entityType: 'ReExamPayment',
        entityId: obligation.id,
        metadata: {
          principal: 'provider',
          accountId: order.studentAccountId,
          applicationId: obligation.applicationId,
          hasEvidence: false,
          source: 'RAZORPAY_TEST',
        },
      },
      tx,
    );
    await this.audit.writeAuditEvent(
      {
        action: AUDIT_ACTIONS.razorpayPaymentCapturedMatched,
        entityType: 'ReExamPayment',
        entityId: obligation.id,
        metadata: { receiptId: receipt.id, orderId: order.id, mode: 'TEST' },
      },
      tx,
    );
    return { matched: true };
  }
}
