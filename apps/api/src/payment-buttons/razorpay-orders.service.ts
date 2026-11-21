import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import {
  RazorpayApiError,
  razorpayOrderReceipt,
  verifyRazorpayCheckoutSignature,
  type RazorpayEvidence,
} from '@docversity/payments';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  type RazorpayCheckoutReturn,
  type RazorpayOrderView,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { isUsable } from '../re-exams/payment-destinations.service.js';
import {
  REFUND_CANDIDATE,
  abandonOpenRazorpayOrders,
  matchCapture,
  type CaptureReceipt,
  type CurrentPayment,
} from '@docversity/payments/server';
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
export { REFUND_CANDIDATE };
/**
 * The brief's payment states on the existing order model. AUTHORIZED never appears: an authorized,
 * uncaptured payment leaves the order PENDING (reconciliation reports it; Razorpay auto-refunds it).
 */
export function paymentState(
  status: string,
  events: readonly { kind: string }[],
): 'PENDING' | 'PAID' | 'RECONCILIATION_REQUIRED' | 'FAILED' | 'ABANDONED' {
  const flagged = events.some((e) => e.kind === 'FLAGGED');
  if (status === 'PAID') return 'PAID';
  if (flagged) return 'RECONCILIATION_REQUIRED';
  if (status === 'CREATE_FAILED') return 'FAILED';
  if (status === 'ABANDONED') return 'ABANDONED';
  return 'PENDING';
}

/** An unpaid CREATED order is offered for this long, then abandoned and replaced. */
const ORDER_TTL_MS = 30 * 60_000;
const CREATE_LEASE_MS = 25_000;
const WAIT_FOR_CREATE_MS = 10_000;

export type ObligationForCheckout = Prisma.ReExamPaymentGetPayload<{
  include: { application: true; destination: true };
}>;

export function payable(p: ObligationForCheckout | null): p is ObligationForCheckout {
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

  /** How long an unpaid CREATED order is offered (tests shorten it). */
  orderTtlMs = ORDER_TTL_MS;

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
    const registrationId = owned?.application.studentRegistrationId;
    // Both the config allowlist and the operator's DB marker must name the registration.
    if (
      !registrationId ||
      !policy.registrationIds.includes(registrationId) ||
      !(await this.prisma.client.razorpayTestRegistration.findUnique({ where: { registrationId } }))
    )
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
    const deadline = Date.now() + WAIT_FOR_CREATE_MS;
    for (;;) {
      const step = await this.reserve(paymentId, accountId, policy.merchantId);
      if (step.kind === 'CREATED') return view(step.order);
      if (step.kind === 'EXPIRED') {
        // Ask Razorpay before closing an old order: a payment may be in flight on it.
        if (await this.paymentInFlight(step.order.providerOrderId)) return view(step.order);
        await this.prisma.client.$transaction((tx) =>
          abandonOpenRazorpayOrders(tx, { id: step.order.id, status: 'CREATED' }, 'EXPIRED'),
        );
        continue;
      }
      if (step.kind === 'CLOSED') throw notPayable();
      if (step.kind === 'CALL') return view(await this.createRemote(step.order, accountId));
      // Another request holds the create lease: wait for it rather than calling Razorpay twice.
      if (Date.now() > deadline) throw providerUnavailable();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /** Short transaction: re-checks the obligation, closes stale orders, and hands out the lease. */
  private reserve(paymentId: string, accountId: string, merchantId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM re_exam_payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const locked = await tx.reExamPayment.findUnique({
        where: { id: paymentId },
        include: { application: true, destination: true },
      });
      const open = await tx.razorpayOrder.findFirst({
        where: { paymentId, status: { in: ['RESERVED', 'CREATED'] } },
      });
      const now = Date.now();
      if (!payable(locked)) {
        await abandonOpenRazorpayOrders(tx, { paymentId }, 'OBLIGATION_NOT_OPEN');
        return { kind: 'CLOSED' as const };
      }
      if (open?.status === 'CREATED') {
        if (now - open.createdAt.getTime() < this.orderTtlMs)
          return { kind: 'CREATED' as const, order: open };
        return { kind: 'EXPIRED' as const, order: open };
      }
      const leaseUntil = new Date(now + CREATE_LEASE_MS);
      if (open) {
        if (open.createLeaseUntil && open.createLeaseUntil.getTime() > now)
          return { kind: 'WAIT' as const };
        const claimed = await tx.razorpayOrder.update({
          where: { id: open.id },
          data: { createLeaseUntil: leaseUntil },
        });
        return { kind: 'CALL' as const, order: claimed };
      }
      const last = await tx.razorpayOrder.aggregate({
        where: { paymentId },
        _max: { attempt: true },
      });
      const attempt = (last._max.attempt ?? 0) + 1;
      if (attempt > 99) return { kind: 'CLOSED' as const };
      const order = await tx.razorpayOrder.create({
        data: {
          paymentId,
          attempt,
          receipt: razorpayOrderReceipt(paymentId, attempt),
          mode: 'TEST',
          accountId: merchantId,
          amountMinor: locked.amountMinor,
          currency: locked.currency,
          studentAccountId: accountId,
          createLeaseUntil: leaseUntil,
        },
      });
      await tx.razorpayOrderEvent.create({ data: { orderId: order.id, kind: 'RESERVED' } });
      return { kind: 'CALL' as const, order };
    });
  }

  /**
   * Provider calls run outside any transaction. A crash or lost response leaves the order RESERVED;
   * the next lease holder finds the Razorpay order by its receipt before creating, so it is never
   * created twice.
   */
  private async createRemote(
    order: {
      id: string;
      paymentId: string;
      attempt: number;
      receipt: string;
      amountMinor: number;
      currency: string;
    },
    accountId: string,
  ) {
    const client = this.gateway.client();
    let remote;
    try {
      remote =
        (await client.findOrdersByReceipt(order.receipt))[0] ??
        (await client.createOrder({
          amountMinor: order.amountMinor,
          currency: order.currency,
          receipt: order.receipt,
          notes: { obligation_id: order.paymentId, attempt: String(order.attempt), mode: 'TEST' },
        }));
    } catch (error) {
      if (!(error instanceof RazorpayApiError)) throw error;
      // Transient (or "duplicate receipt", which the next lookup resolves): keep RESERVED, free the lease.
      if (error.transient || error.code === 'DUPLICATE_RECEIPT') await this.releaseLease(order.id);
      else await this.fail(order.id, error.code);
      throw providerUnavailable();
    }
    if (remote.amount !== order.amountMinor || remote.currency !== order.currency) {
      await this.fail(order.id, 'AMOUNT_MISMATCH');
      throw providerUnavailable();
    }
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE id = ${order.id}::uuid FOR UPDATE`;
      const row = await tx.razorpayOrder.findUniqueOrThrow({ where: { id: order.id } });
      if (row.status === 'CREATED' && row.providerOrderId === remote.id) return row;
      // Closed meanwhile (manual submission, void, cancel): the remote order is never offered.
      if (row.status !== 'RESERVED') throw notPayable();
      const updated = await tx.razorpayOrder.update({
        where: { id: row.id },
        data: { status: 'CREATED', providerOrderId: remote.id, createLeaseUntil: null },
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
            paymentId: row.paymentId,
            attempt: row.attempt,
            amountMinor: row.amountMinor,
            currency: row.currency,
            mode: 'TEST',
          },
        },
        tx,
      );
      return updated;
    });
  }

  /** True when Razorpay has a created, authorized or captured payment on the order (or cannot say). */
  private async paymentInFlight(providerOrderId: string | null): Promise<boolean> {
    if (!providerOrderId) return false;
    try {
      const payments = await this.gateway.client().fetchOrderPayments(providerOrderId);
      return payments.some((p) => ['created', 'authorized', 'captured'].includes(p.status));
    } catch {
      return true; // unknown: keep the order open rather than risk a capture on a closed order
    }
  }

  private async releaseLease(orderId: string) {
    await this.prisma.client.razorpayOrder.updateMany({
      where: { id: orderId, status: 'RESERVED' },
      data: { createLeaseUntil: null },
    });
  }

  private async fail(orderId: string, reason: string) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const row = await tx.razorpayOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (row.status !== 'RESERVED') return;
      await tx.razorpayOrder.update({
        where: { id: orderId },
        data: { status: 'CREATE_FAILED', createLeaseUntil: null },
      });
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

  /** The student's own attempts for one obligation, oldest first. */
  async studentHistory(studentId: string, paymentId: string) {
    this.policy.requireFixture();
    const owned = await this.prisma.client.reExamPayment.findFirst({
      where: { id: paymentId, studentId },
      select: { id: true },
    });
    if (!owned) throw Errors.notFound();
    const orders = await this.prisma.client.razorpayOrder.findMany({
      where: { paymentId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
      orderBy: { attempt: 'asc' },
    });
    return {
      orders: orders.map((o) => ({
        attempt: o.attempt,
        paymentState: paymentState(o.status, o.events),
        providerOrderId: o.providerOrderId,
        providerPaymentId: o.providerPaymentId,
        amountMinor: o.amountMinor,
        currency: o.currency,
        createdAt: o.createdAt.toISOString(),
        checkoutReturnedAt:
          o.events.find((e) => e.kind === 'CHECKOUT_RETURNED')?.createdAt.toISOString() ?? null,
      })),
    };
  }

  /** Binds a signed capture to its order and obligation (shared core; see matchCapture). */
  matchCapture(tx: Prisma.TransactionClient, receipt: CaptureReceipt, current: CurrentPayment) {
    return matchCapture(tx, (entry, t) => this.audit.writeAuditEvent(entry, t), receipt, current);
  }
}
