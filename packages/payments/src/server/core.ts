import type { Prisma, PrismaClient } from '@docversity/database';
import { AUDIT_ACTIONS, type AuditAction } from '@docversity/types';
import { normalizeTransactionReference, type RazorpayEnv } from '@docversity/validation';
import { RazorpayApiError, type RazorpayClient, type RazorpayPayment } from '../razorpay-client.js';
import type { RazorpayEvidence, RazorpayRefundEvidence } from '../razorpay.js';

/**
 * Framework-free Razorpay TEST-mode core shared by the API (requests, webhooks) and the worker
 * (scheduled reconciliation). Every money decision lives here once.
 */

export interface RazorpayPolicy {
  mode: 'TEST';
  merchantId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  registrationIds: readonly string[];
  refunds: 'off' | 'full_only' | 'partial';
}

/** Only `test` with every secret yields a policy; `off` (default) and `live` never do. */
export function razorpayPolicy(env: RazorpayEnv): RazorpayPolicy | null {
  const {
    PAYMENTS_RAZORPAY_MODE: mode,
    RAZORPAY_ACCOUNT_ID: merchantId,
    RAZORPAY_KEY_ID: keyId,
    RAZORPAY_KEY_SECRET: keySecret,
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    PAYMENTS_TEST_REGISTRATION_ALLOWLIST: registrationIds,
  } = env;
  if (
    mode !== 'test' ||
    !merchantId ||
    !keyId?.startsWith('rzp_test_') ||
    !keySecret ||
    !webhookSecret ||
    registrationIds.length === 0
  )
    return null;
  return {
    mode: 'TEST',
    merchantId,
    keyId,
    keySecret,
    webhookSecret,
    registrationIds,
    refunds: env.PAYMENTS_RAZORPAY_REFUNDS,
  };
}

export interface AuditEntry {
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}
export type AuditWriter = (entry: AuditEntry, tx?: Prisma.TransactionClient) => Promise<void>;
export interface PaymentAlert {
  kind:
    | 'WEBHOOK_DIGEST_CONFLICT'
    | 'WEBHOOK_ACCOUNT_MISMATCH'
    | 'CAPTURE_FLAGGED'
    | 'RECONCILIATION_ISSUES'
    | 'REFUND_FAILED';
  severity: 'warning' | 'critical';
  details: Record<string, string | number | boolean | null>;
}
export type AlertNotifier = (alert: PaymentAlert) => Promise<void>;

// PROVIDER_UNVERIFIED is deliberately absent: it is not final, reconciliation re-matches it.
export const REFUND_CANDIDATE = new Set([
  'OBLIGATION_NOT_OPEN',
  'ORDER_ALREADY_PAID',
  'PAYMENT_ALREADY_USED',
  'AMOUNT_MISMATCH',
  'ORDER_NOT_OPEN',
  'PROVIDER_STATE_MISMATCH',
]);

/**
 * Closes open orders of obligations that can no longer be paid online. RESERVED becomes
 * CREATE_FAILED and CREATED becomes ABANDONED, each with an event. Runs in the caller's transaction.
 */
export async function abandonOpenRazorpayOrders(
  tx: Prisma.TransactionClient,
  where: Prisma.RazorpayOrderWhereInput,
  reason: string,
): Promise<number> {
  const open = await tx.razorpayOrder.findMany({
    where: { ...where, status: { in: ['RESERVED', 'CREATED'] } },
    select: { id: true, status: true },
  });
  for (const order of open) {
    const created = order.status === 'CREATED';
    await tx.razorpayOrder.update({
      where: { id: order.id },
      data: { status: created ? 'ABANDONED' : 'CREATE_FAILED', createLeaseUntil: null },
    });
    await tx.razorpayOrderEvent.create({
      data: { orderId: order.id, kind: created ? 'ABANDONED' : 'CREATE_FAILED', reason },
    });
  }
  return open.length;
}

export type CurrentPayment = RazorpayPayment | 'UNVERIFIABLE' | null;
export type CaptureMatch = { matched: true } | { matched: false; reason: string };
export type CaptureReceipt = {
  id: string;
  providerOrderId: string | null;
  providerPaymentId: string;
} & Pick<
  RazorpayEvidence,
  'merchantId' | 'amountMinor' | 'currency' | 'captured' | 'amountRefunded'
>;

/**
 * Binds a signed capture to its order and obligation only when every money check holds: stored
 * order in CREATED, same account, amount and currency exactly equal to the order AND the obligation,
 * captured (never authorized), the re-fetched provider state agrees, and the obligation is still
 * open. Then order PAID and obligation SUBMITTED (staff still verify). Otherwise FLAGGED.
 */
export async function matchCapture(
  tx: Prisma.TransactionClient,
  audit: AuditWriter,
  receipt: CaptureReceipt,
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
    await audit(
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
  await audit(
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
  await audit(
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

// ---------------------------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------------------------

export type RefundState = 'NONE' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
/** Statuses that hold refund headroom and are, or may be, money already leaving (DB trigger too). */
export const LIVE_REFUND_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'SENDING',
  'PENDING',
  'PROCESSED',
] as const;
/**
 * Refund state of a payment, derived from its refunds (no duplicated status column):
 * any REQUESTED/APPROVED/SENDING/PENDING refund → REFUND_PENDING; otherwise the PROCESSED total.
 */
export function refundState(
  capturedMinor: number,
  refunds: readonly { status: string; amountMinor: number }[],
): RefundState {
  if (refunds.some((r) => ['REQUESTED', 'APPROVED', 'SENDING', 'PENDING'].includes(r.status)))
    return 'REFUND_PENDING';
  const processed = refunds
    .filter((r) => r.status === 'PROCESSED')
    .reduce((sum, r) => sum + r.amountMinor, 0);
  return processed === 0 ? 'NONE' : processed >= capturedMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}

const STATUS_FROM_PROVIDER = {
  pending: 'PENDING',
  processed: 'PROCESSED',
  failed: 'FAILED',
} as const;
/** One sender at a time; a crashed sender's lease expires and the next one looks up first. */
export const REFUND_SEND_LEASE_MS = 25_000;

/**
 * Sends an APPROVED refund to Razorpay outside any transaction, under a send lease
 * (APPROVED → SENDING). FAILED is recorded only when Razorpay itself reports it: an ambiguous or
 * refused send stays SENDING (headroom stays reserved) after looking the refund up at the provider
 * by its receipt; reconciliation resolves it later. A resend reuses the same idempotency key.
 */
export async function submitApprovedRefund(
  prisma: PrismaClient,
  client: RazorpayClient,
  audit: AuditWriter,
  refundId: string,
  now: () => Date = () => new Date(),
): Promise<{ status: string; alert: PaymentAlert | null }> {
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM razorpay_refunds WHERE id = ${refundId}::uuid FOR UPDATE`;
    const row = await tx.razorpayRefund.findUniqueOrThrow({ where: { id: refundId } });
    const leased = row.sendLeaseUntil !== null && row.sendLeaseUntil > now();
    if (row.source !== 'STAFF' || !['APPROVED', 'SENDING'].includes(row.status) || leased)
      return { row, claimed: false, retry: false };
    await tx.razorpayRefund.update({
      where: { id: refundId },
      data: {
        status: 'SENDING',
        sendLeaseUntil: new Date(now().getTime() + REFUND_SEND_LEASE_MS),
      },
    });
    await tx.razorpayRefundEvent.create({ data: { refundId, kind: 'SUBMITTED' } });
    return { row, claimed: true, retry: row.status === 'SENDING' };
  });
  const refund = claim.row;
  if (!claim.claimed) return { status: refund.status, alert: null };
  const release = () =>
    prisma.razorpayRefund.updateMany({
      where: { id: refundId, status: 'SENDING' },
      data: { sendLeaseUntil: null },
    });
  // A previous attempt may have reached Razorpay: look it up before sending again.
  if (claim.retry) {
    const found = await findProviderRefund(client, refund).catch(() => undefined);
    if (found) {
      const status = STATUS_FROM_PROVIDER[found.status];
      await recordRefundStatus(prisma, audit, refundId, status, found.id, null, 'PROVIDER_LOOKUP');
      return { status, alert: null };
    }
    if (found === undefined) {
      await release();
      return { status: 'SENDING', alert: null };
    }
  }
  let remote;
  try {
    remote = await client.createRefund(refund.providerPaymentId, {
      amountMinor: refund.amountMinor,
      idempotencyKey: refund.idempotencyKey ?? '',
      ...(refund.receipt ? { receipt: refund.receipt } : {}),
      notes: { refund_id: refund.id, mode: 'TEST' },
    });
  } catch (error) {
    if (!(error instanceof RazorpayApiError)) throw error;
    // The response is lost or refused, but Razorpay may still have refunded: ask before deciding.
    const found = await findProviderRefund(client, refund).catch(() => undefined);
    if (found) {
      const status = STATUS_FROM_PROVIDER[found.status];
      await recordRefundStatus(prisma, audit, refundId, status, found.id, null, 'PROVIDER_LOOKUP');
      return { status, alert: null };
    }
    if (error.transient || found === undefined) {
      await release();
      return { status: 'SENDING', alert: null };
    }
    // Definitely not at Razorpay and refused: keep SENDING (headroom reserved) for a person.
    await prisma.$transaction(async (tx) => {
      await tx.razorpayRefund.update({
        where: { id: refundId },
        data: { failureReason: error.code, sendLeaseUntil: null },
      });
      await tx.razorpayRefundEvent.create({ data: { refundId, kind: 'SEND_REJECTED' } });
      await audit(
        {
          action: AUDIT_ACTIONS.razorpayRefundUpdated,
          entityType: 'RazorpayRefund',
          entityId: refundId,
          metadata: { status: 'SENDING', sendRejected: error.code, source: 'API' },
        },
        tx,
      );
    });
    return {
      status: 'SENDING',
      alert: {
        kind: 'REFUND_FAILED',
        severity: 'critical',
        details: { refundId, code: error.code, providerRefundFound: false },
      },
    };
  }
  if (remote.amount !== refund.amountMinor || remote.payment_id !== refund.providerPaymentId) {
    await release();
    throw new RazorpayApiError('MALFORMED_RESPONSE');
  }
  const status = STATUS_FROM_PROVIDER[remote.status];
  await recordRefundStatus(prisma, audit, refundId, status, remote.id, null, 'API');
  return { status, alert: null };
}

/** The provider's refund for this request: by receipt or our refund id in notes. null = none. */
async function findProviderRefund(
  client: RazorpayClient,
  refund: {
    id: string;
    providerPaymentId: string;
    receipt: string | null;
    providerRefundId: string | null;
  },
) {
  if (refund.providerRefundId) return client.fetchRefund(refund.providerRefundId);
  const refunds = await client.fetchPaymentRefunds(refund.providerPaymentId);
  return (
    refunds.find(
      (r) =>
        (refund.receipt !== null && r.receipt === refund.receipt) ||
        r.notes?.refund_id === refund.id,
    ) ?? null
  );
}

async function recordRefundStatus(
  prisma: PrismaClient,
  audit: AuditWriter,
  refundId: string,
  status: 'PENDING' | 'PROCESSED' | 'FAILED',
  providerRefundId: string | null,
  failureReason: string | null,
  source: 'API' | 'PROVIDER_LOOKUP' | 'RECONCILIATION',
) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM razorpay_refunds WHERE id = ${refundId}::uuid FOR UPDATE`;
    const row = await tx.razorpayRefund.findUniqueOrThrow({ where: { id: refundId } });
    if (!advances(row.status, status)) return;
    await tx.razorpayRefund.update({
      where: { id: refundId },
      data: {
        status,
        sendLeaseUntil: null,
        ...(providerRefundId && !row.providerRefundId ? { providerRefundId } : {}),
        ...(failureReason ? { failureReason } : {}),
      },
    });
    await tx.razorpayRefundEvent.create({ data: { refundId, kind: status } });
    await audit(
      {
        action: AUDIT_ACTIONS.razorpayRefundUpdated,
        entityType: 'RazorpayRefund',
        entityId: refundId,
        metadata: { status, failureReason, source },
      },
      tx,
    );
  });
}

/** Forward-only refund status (mirrors the DB trigger). FAILED only after the provider answered. */
function advances(from: string, to: string): boolean {
  return (
    (from === 'SENDING' && ['PENDING', 'PROCESSED', 'FAILED'].includes(to)) ||
    (from === 'PENDING' && ['PROCESSED', 'FAILED'].includes(to))
  );
}

/** Our order holding this provider payment: its PAID payment, or a captured receipt on it. */
async function orderOfProviderPayment(tx: Prisma.TransactionClient, providerPaymentId: string) {
  const paid = await tx.razorpayOrder.findUnique({ where: { providerPaymentId } });
  if (paid) return paid;
  const receipt = await tx.razorpayWebhookReceipt.findFirst({
    where: { providerPaymentId, captured: true, providerOrderId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  return receipt?.providerOrderId
    ? tx.razorpayOrder.findUnique({ where: { providerOrderId: receipt.providerOrderId } })
    : null;
}

/**
 * Applies a signed refund.* event. Refunds Docversity issued are matched by provider refund id or
 * our receipt and move forward only. A refund made in the Razorpay dashboard for one of our
 * payments (PAID or a flagged capture) is recorded as a DASHBOARD refund so headroom and states
 * stay true; anything else is reported as UNKNOWN_REFUND.
 */
export async function applyRefundEvent(
  tx: Prisma.TransactionClient,
  audit: AuditWriter,
  evidence: RazorpayRefundEvidence,
): Promise<'APPLIED' | 'UNCHANGED' | 'RECORDED_DASHBOARD' | 'UNKNOWN_REFUND'> {
  const refund = await tx.razorpayRefund.findFirst({
    where: {
      OR: [
        { providerRefundId: evidence.providerRefundId },
        ...(evidence.receipt ? [{ receipt: evidence.receipt }] : []),
      ],
    },
  });
  const status = STATUS_FROM_PROVIDER[evidence.status];
  if (!refund) {
    const order = await orderOfProviderPayment(tx, evidence.providerPaymentId);
    if (!order) return 'UNKNOWN_REFUND';
    await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE id = ${order.id}::uuid FOR UPDATE`;
    const created = await tx.razorpayRefund.create({
      data: {
        orderId: order.id,
        providerPaymentId: evidence.providerPaymentId,
        amountMinor: evidence.amountMinor,
        currency: evidence.currency,
        reason: 'DASHBOARD_REFUND',
        status,
        source: 'DASHBOARD',
        providerRefundId: evidence.providerRefundId,
      },
    });
    await tx.razorpayRefundEvent.create({
      data: {
        refundId: created.id,
        kind: 'DASHBOARD',
        eventId: evidence.eventId,
        bodySha256: evidence.bodySha256,
      },
    });
    await audit(
      {
        action: AUDIT_ACTIONS.razorpayRefundUpdated,
        entityType: 'RazorpayRefund',
        entityId: created.id,
        metadata: { status, eventType: evidence.eventType, source: 'DASHBOARD', orderId: order.id },
      },
      tx,
    );
    return 'RECORDED_DASHBOARD';
  }
  if (
    refund.providerPaymentId !== evidence.providerPaymentId ||
    refund.amountMinor !== evidence.amountMinor ||
    refund.currency !== evidence.currency
  )
    return 'UNKNOWN_REFUND';
  await tx.$queryRaw`SELECT id FROM razorpay_refunds WHERE id = ${refund.id}::uuid FOR UPDATE`;
  const row = await tx.razorpayRefund.findUniqueOrThrow({ where: { id: refund.id } });
  // A webhook can arrive before our send finished (APPROVED): it proves the provider has it.
  if (row.status === 'APPROVED')
    await tx.razorpayRefund.update({ where: { id: row.id }, data: { status: 'SENDING' } });
  const from = row.status === 'APPROVED' ? 'SENDING' : row.status;
  // Out-of-order safe: an event never moves a refund backwards.
  if (!advances(from, status)) return 'UNCHANGED';
  await tx.razorpayRefund.update({
    where: { id: row.id },
    data: {
      status,
      sendLeaseUntil: null,
      ...(row.providerRefundId ? {} : { providerRefundId: evidence.providerRefundId }),
      ...(status === 'FAILED' ? { failureReason: 'PROVIDER_FAILED' } : {}),
    },
  });
  await tx.razorpayRefundEvent.create({
    data: {
      refundId: row.id,
      kind: status,
      eventId: evidence.eventId,
      bodySha256: evidence.bodySha256,
    },
  });
  await audit(
    {
      action: AUDIT_ACTIONS.razorpayRefundUpdated,
      entityType: 'RazorpayRefund',
      entityId: row.id,
      metadata: { status, eventType: evidence.eventType, source: 'WEBHOOK' },
    },
    tx,
  );
  return 'APPLIED';
}

// ---------------------------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------------------------

export interface ReconciliationIssue {
  code:
    | 'PAID_ORDER_PAYMENT_MISSING'
    | 'PAID_ORDER_DRIFT'
    | 'CAPTURE_WITHOUT_WEBHOOK'
    | 'CAPTURE_UNMATCHED'
    | 'AUTHORIZED_UNCAPTURED'
    | 'SETTLEMENT_AMOUNT_DRIFT'
    | 'REFUND_FAILED'
    | 'PROVIDER_UNAVAILABLE';
  orderId: string | null;
  providerPaymentId: string | null;
  driftMinor: number;
}
export interface ReconciliationSummary {
  ordersChecked: number;
  rematched: number;
  closed: number;
  refundsAdvanced: number;
  issues: ReconciliationIssue[];
  driftMinor: number;
  settlement: 'CHECKED' | 'EMPTY' | 'UNAVAILABLE';
}
export interface ReconcileDeps {
  prisma: PrismaClient;
  client: RazorpayClient;
  audit: AuditWriter;
  notify: AlertNotifier;
  now?: Date;
  lookbackDays?: number;
  orderTtlMs?: number;
}

const clean = (p: RazorpayPayment, amount: number, currency: string) =>
  p.status === 'captured' &&
  p.captured &&
  p.amount_refunded === 0 &&
  p.amount === amount &&
  p.currency === currency;

/**
 * Drives uncertain orders toward a final state and proves the money:
 * - RESERVED with no live lease: found by receipt → CREATED; otherwise, once stale, CREATE_FAILED.
 * - CREATED: captured + PROVIDER_UNVERIFIED receipt → re-matched; captured without a signed receipt →
 *   reported (never fulfilled); authorized-only → reported (Razorpay auto-refunds uncaptured
 *   payments); nothing and stale → ABANDONED.
 * - PAID: the provider must still show that exact captured, unrefunded payment.
 * - Refunds: APPROVED (unsent) are re-sent with their key; PENDING are re-fetched.
 * - Settlement recon for the previous UTC day, where Razorpay provides it.
 * Never marks anything paid without a signed receipt AND a captured, amount-exact provider payment.
 */
export async function reconcileRazorpay(deps: ReconcileDeps): Promise<ReconciliationSummary> {
  const { prisma, client, audit } = deps;
  const now = deps.now ?? new Date();
  const ttl = deps.orderTtlMs ?? 30 * 60_000;
  const since = new Date(now.getTime() - (deps.lookbackDays ?? 3) * 86_400_000);
  // Paged by id (UUIDv7, time-ordered) so every recent order is visited, not only the oldest batch.
  const orders: Awaited<ReturnType<typeof prisma.razorpayOrder.findMany>> = [];
  for (let page = 0; page < 50; page++) {
    const batch = await prisma.razorpayOrder.findMany({
      where: {
        status: { in: ['RESERVED', 'CREATED', 'PAID'] },
        updatedAt: { gte: since },
        ...(orders.length > 0 ? { id: { gt: orders[orders.length - 1]?.id } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 200,
    });
    orders.push(...batch);
    if (batch.length < 200) break;
  }
  const issues: ReconciliationIssue[] = [];
  let rematched = 0;
  let closed = 0;
  const issue = (
    code: ReconciliationIssue['code'],
    orderId: string | null,
    providerPaymentId: string | null,
    driftMinor = 0,
  ) => issues.push({ code, orderId, providerPaymentId, driftMinor });
  const stale = (createdAt: Date) => now.getTime() - createdAt.getTime() >= ttl;

  for (const order of orders) {
    try {
      if (order.status === 'RESERVED') {
        if (order.createLeaseUntil && order.createLeaseUntil > now) continue;
        const remote = (await client.findOrdersByReceipt(order.receipt))[0];
        await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE id = ${order.id}::uuid FOR UPDATE`;
          const row = await tx.razorpayOrder.findUniqueOrThrow({ where: { id: order.id } });
          if (row.status !== 'RESERVED') return;
          if (remote?.amount === row.amountMinor && remote.currency === row.currency) {
            await tx.razorpayOrder.update({
              where: { id: row.id },
              data: { status: 'CREATED', providerOrderId: remote.id, createLeaseUntil: null },
            });
            await tx.razorpayOrderEvent.create({ data: { orderId: row.id, kind: 'CREATED' } });
          } else if (stale(row.createdAt)) {
            await abandonOpenRazorpayOrders(tx, { id: row.id }, 'STALE_RESERVATION');
            closed++;
          }
        });
        continue;
      }
      const providerOrderId = order.providerOrderId ?? '';
      const payments = await client.fetchOrderPayments(providerOrderId);
      if (order.status === 'PAID') {
        const paid = payments.find((p) => p.id === order.providerPaymentId);
        // Razorpay's amount_refunded includes pending refunds; SENDING may or may not be there yet.
        const sum = async (statuses: ('PENDING' | 'PROCESSED' | 'SENDING')[]) =>
          (
            await prisma.razorpayRefund.aggregate({
              where: { providerPaymentId: order.providerPaymentId ?? '', status: { in: statuses } },
              _sum: { amountMinor: true },
            })
          )._sum.amountMinor ?? 0;
        const known = await sum(['PENDING', 'PROCESSED']);
        const sending = await sum(['SENDING']);
        if (!paid)
          issue('PAID_ORDER_PAYMENT_MISSING', order.id, order.providerPaymentId, order.amountMinor);
        else if (
          paid.amount !== order.amountMinor ||
          paid.currency !== order.currency ||
          !paid.captured ||
          paid.amount_refunded < known ||
          paid.amount_refunded > known + sending
        )
          issue(
            'PAID_ORDER_DRIFT',
            order.id,
            paid.id,
            paid.amount !== order.amountMinor
              ? order.amountMinor - paid.amount
              : paid.amount_refunded - known,
          );
        continue;
      }
      // CREATED
      const captured = payments.filter((p) => p.captured);
      for (const payment of captured) {
        const receipt = await prisma.razorpayWebhookReceipt.findFirst({
          where: { providerPaymentId: payment.id, providerOrderId, captured: true },
          orderBy: { createdAt: 'desc' },
        });
        if (!receipt) {
          issue('CAPTURE_WITHOUT_WEBHOOK', order.id, payment.id, payment.amount);
          continue;
        }
        const last = await prisma.razorpayOrderEvent.findFirst({
          where: { orderId: order.id, receiptId: receipt.id, kind: 'FLAGGED' },
          orderBy: { createdAt: 'desc' },
        });
        if (
          last?.reason === 'PROVIDER_UNVERIFIED' &&
          clean(payment, order.amountMinor, order.currency)
        ) {
          const match = await prisma.$transaction((tx) =>
            matchCapture(tx, audit, receipt, payment),
          );
          if (match.matched) {
            rematched++;
            continue;
          }
        }
        issue('CAPTURE_UNMATCHED', order.id, payment.id, payment.amount);
      }
      const authorized = payments.filter((p) => p.status === 'authorized' && !p.captured);
      for (const payment of authorized) issue('AUTHORIZED_UNCAPTURED', order.id, payment.id);
      // Never abandon while Razorpay still has a payment in flight on the order.
      const inFlight = payments.some((p) => ['created', 'authorized'].includes(p.status));
      if (captured.length === 0 && !inFlight && stale(order.createdAt)) {
        await prisma.$transaction((tx) =>
          abandonOpenRazorpayOrders(tx, { id: order.id, status: 'CREATED' }, 'EXPIRED'),
        );
        closed++;
      }
    } catch (error) {
      if (!(error instanceof RazorpayApiError)) throw error;
      issue('PROVIDER_UNAVAILABLE', order.id, null);
    }
  }

  // Refunds approved but not sent, stuck SENDING (lease expired; looked up before any resend),
  // or still PENDING at Razorpay.
  let refundsAdvanced = 0;
  const refunds = await prisma.razorpayRefund.findMany({
    where: { source: 'STAFF', status: { in: ['APPROVED', 'SENDING', 'PENDING'] } },
    orderBy: { id: 'asc' },
    take: 500,
  });
  for (const refund of refunds) {
    try {
      if (refund.status === 'APPROVED' || refund.status === 'SENDING') {
        const result = await submitApprovedRefund(prisma, client, audit, refund.id, () => now);
        if (!['APPROVED', 'SENDING'].includes(result.status)) refundsAdvanced++;
        if (result.status === 'FAILED' || result.alert)
          issue('REFUND_FAILED', refund.orderId, refund.providerPaymentId);
      } else if (refund.providerRefundId) {
        const remote = await client.fetchRefund(refund.providerRefundId);
        const status = STATUS_FROM_PROVIDER[remote.status];
        if (status !== 'PENDING') {
          await recordRefundStatus(
            prisma,
            audit,
            refund.id,
            status,
            null,
            status === 'FAILED' ? 'PROVIDER_FAILED' : null,
            'RECONCILIATION',
          );
          refundsAdvanced++;
          if (status === 'FAILED') issue('REFUND_FAILED', refund.orderId, refund.providerPaymentId);
        }
      }
    } catch (error) {
      if (!(error instanceof RazorpayApiError)) throw error;
      issue('PROVIDER_UNAVAILABLE', refund.orderId, null);
    }
  }

  // Settlement recon for the previous UTC day. Test mode may have no settlements: say so.
  const day = new Date(now.getTime() - 86_400_000);
  let settlement: ReconciliationSummary['settlement'] = 'UNAVAILABLE';
  try {
    const rows = await client.fetchSettlementRecon({
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
    });
    settlement = rows.length === 0 ? 'EMPTY' : 'CHECKED';
    for (const row of rows.filter((r) => r.type === 'payment' && r.order_id)) {
      const order = await prisma.razorpayOrder.findUnique({
        where: { providerOrderId: row.order_id ?? '' },
      });
      if (order && row.amount !== order.amountMinor)
        issue(
          'SETTLEMENT_AMOUNT_DRIFT',
          order.id,
          row.payment_id ?? null,
          order.amountMinor - row.amount,
        );
    }
  } catch (error) {
    if (!(error instanceof RazorpayApiError)) throw error;
  }

  const driftMinor = issues.reduce((sum, i) => sum + Math.abs(i.driftMinor), 0);
  const counts: Record<string, number> = {};
  for (const i of issues) counts[i.code] = (counts[i.code] ?? 0) + 1;
  await audit({
    action: AUDIT_ACTIONS.razorpayReconciliationRun,
    entityType: 'RazorpayReconciliationRun',
    entityId: null,
    metadata: {
      ordersChecked: orders.length,
      rematched,
      closed,
      refundsAdvanced,
      issues: counts,
      driftMinor,
      settlement,
      mode: 'TEST',
    },
  });
  if (issues.length > 0)
    await deps.notify({
      kind: 'RECONCILIATION_ISSUES',
      severity: driftMinor > 0 ? 'critical' : 'warning',
      details: { issues: issues.length, driftMinor, ordersChecked: orders.length, settlement },
    });
  return {
    ordersChecked: orders.length,
    rematched,
    closed,
    refundsAdvanced,
    issues,
    driftMinor,
    settlement,
  };
}

/** Audit writer over a bare Prisma client, for processes without the API's AuditService. */
export function prismaAuditWriter(prisma: PrismaClient): AuditWriter {
  return async (entry, tx) => {
    await (tx ?? prisma).auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  };
}

/**
 * Alert delivery chosen by ops: with PAYMENTS_ALERT_WEBHOOK_URL (https) every alert is POSTed as
 * JSON (works with ntfy, Slack-compatible relays or a mail gateway); otherwise `fallback` (log).
 * Never throws and never sends secrets: alerts carry ids and codes only.
 */
export function alertNotifier(
  url: string | undefined,
  fallback: AlertNotifier,
  fetchImpl: typeof fetch = fetch,
): AlertNotifier {
  if (!url) return fallback;
  return async (alert) => {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Title: `Docversity payments: ${alert.kind}`,
        },
        body: JSON.stringify({ source: 'docversity-payments', mode: 'TEST', ...alert }),
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) await fallback(alert);
    } catch {
      await fallback(alert);
    }
  };
}
