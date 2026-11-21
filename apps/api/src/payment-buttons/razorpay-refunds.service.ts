import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { refundState, submitApprovedRefund } from '@docversity/payments/server';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  type RazorpayWorkspace,
  type RequestRazorpayRefund,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { PaymentAlertsService } from './payment-alerts.service.js';
import {
  PaymentButtonPolicyService,
  RazorpayGatewayService,
} from './payment-button-policy.service.js';
import { paymentState } from './razorpay-orders.service.js';

const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
const LIVE = ['REQUESTED', 'APPROVED', 'PENDING', 'PROCESSED'] as const;

/**
 * Razorpay TEST refunds with maker-checker: one staff member requests, a DIFFERENT one approves (DB
 * CHECK too). Disabled unless PAYMENTS_RAZORPAY_REFUNDS is set (default off; the university refund
 * policy is open). Partial refunds only when the policy is `partial`. The DB trigger keeps the sum
 * of live refunds ≤ the captured amount; X-Refund-Idempotency + a unique key make retries safe.
 */
@Injectable()
export class RazorpayRefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PaymentButtonPolicyService,
    private readonly gateway: RazorpayGatewayService,
    private readonly audit: AuditService,
    private readonly alerts: PaymentAlertsService,
  ) {}

  private enabledPolicy() {
    const policy = this.policy.requireFixture();
    if (policy.refunds === 'off')
      throw conflict('Refunds are not enabled for Razorpay test payments.');
    return policy;
  }

  async request(
    paymentId: string,
    body: RequestRazorpayRefund,
    actorUserId: string,
  ): Promise<{ id: string; status: string }> {
    const policy = this.enabledPolicy();
    const refund = await this.prisma.client.$transaction(async (tx) => {
      const order = await tx.razorpayOrder.findFirst({ where: { paymentId, status: 'PAID' } });
      if (!order?.providerPaymentId) throw Errors.notFound();
      await tx.$queryRaw`SELECT id FROM razorpay_orders WHERE id = ${order.id}::uuid FOR UPDATE`;
      const live = await tx.razorpayRefund.aggregate({
        where: { orderId: order.id, status: { in: [...LIVE] } },
        _sum: { amountMinor: true },
      });
      const remaining = order.amountMinor - (live._sum.amountMinor ?? 0);
      const amount = body.amountMinor ?? remaining;
      if (remaining <= 0 || amount > remaining)
        throw conflict('The refund would exceed the amount captured for this payment.');
      if (policy.refunds === 'full_only' && amount !== order.amountMinor)
        throw conflict('Only full refunds are allowed by the current refund policy.');
      const key = randomUUID().replaceAll('-', '');
      const created = await tx.razorpayRefund.create({
        data: {
          orderId: order.id,
          providerPaymentId: order.providerPaymentId,
          amountMinor: amount,
          currency: order.currency,
          reason: body.reason,
          idempotencyKey: `refund-${key}`,
          receipt: `rf_${key}`,
          requestedByUserId: actorUserId,
        },
      });
      await tx.razorpayRefundEvent.create({
        data: { refundId: created.id, kind: 'REQUESTED', actorUserId },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.razorpayRefundRequested,
          entityType: 'RazorpayRefund',
          entityId: created.id,
          metadata: { paymentId, orderId: order.id, amountMinor: amount, reason: body.reason },
        },
        tx,
      );
      return created;
    });
    return { id: refund.id, status: refund.status };
  }

  /** Approve (different person) and send; calling again on an APPROVED refund re-sends it safely. */
  async approve(refundId: string, actorUserId: string) {
    this.enabledPolicy();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM razorpay_refunds WHERE id = ${refundId}::uuid FOR UPDATE`;
      const row = await tx.razorpayRefund.findUnique({ where: { id: refundId } });
      if (!row) throw Errors.notFound();
      if (row.requestedByUserId === actorUserId)
        throw new AppError(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.forbidden,
          'A refund must be approved by someone other than the person who requested it.',
        );
      // Idempotent: an approved refund (sent or not) is never approved or sent twice.
      if (['APPROVED', 'PENDING', 'PROCESSED', 'FAILED'].includes(row.status)) return;
      if (row.status !== 'REQUESTED') throw conflict('This refund has already been decided.');
      await tx.razorpayRefund.update({
        where: { id: refundId },
        data: { status: 'APPROVED', approvedByUserId: actorUserId, decidedAt: new Date() },
      });
      await tx.razorpayRefundEvent.create({ data: { refundId, kind: 'APPROVED', actorUserId } });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.razorpayRefundApproved,
          entityType: 'RazorpayRefund',
          entityId: refundId,
          metadata: { requestedByUserId: row.requestedByUserId, amountMinor: row.amountMinor },
        },
        tx,
      );
    });
    // Provider call outside any transaction; transient failures leave it APPROVED for a retry.
    const result = await submitApprovedRefund(
      this.prisma.client,
      this.gateway.client(),
      (entry, tx) => this.audit.writeAuditEvent(entry, tx),
      refundId,
    );
    if (result.alert) await this.alerts.notify(result.alert);
    return { id: refundId, status: result.status };
  }

  async reject(refundId: string, actorUserId: string) {
    this.enabledPolicy();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM razorpay_refunds WHERE id = ${refundId}::uuid FOR UPDATE`;
      const row = await tx.razorpayRefund.findUnique({ where: { id: refundId } });
      if (!row) throw Errors.notFound();
      if (row.requestedByUserId === actorUserId)
        throw new AppError(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.forbidden,
          'A refund must be decided by someone other than the person who requested it.',
        );
      if (row.status !== 'REQUESTED') throw conflict('This refund has already been decided.');
      await tx.razorpayRefund.update({
        where: { id: refundId },
        data: { status: 'REJECTED', approvedByUserId: actorUserId, decidedAt: new Date() },
      });
      await tx.razorpayRefundEvent.create({ data: { refundId, kind: 'REJECTED', actorUserId } });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.razorpayRefundRejected,
          entityType: 'RazorpayRefund',
          entityId: refundId,
          metadata: { requestedByUserId: row.requestedByUserId },
        },
        tx,
      );
    });
    return { id: refundId, status: 'REJECTED' as const };
  }

  /** Staff workspace: orders, derived payment/refund states, refunds and the audit trail. */
  async workspace(paymentId: string): Promise<RazorpayWorkspace> {
    const policy = this.policy.requireFixture();
    const payment = await this.prisma.client.reExamPayment.findUnique({
      where: { id: paymentId },
      select: { id: true },
    });
    if (!payment) throw Errors.notFound();
    const orders = await this.prisma.client.razorpayOrder.findMany({
      where: { paymentId },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        refunds: {
          include: {
            events: { orderBy: { createdAt: 'asc' } },
            requestedBy: { select: { id: true, displayName: true } },
            approvedBy: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { attempt: 'asc' },
    });
    const ids = [
      paymentId,
      ...orders.map((o) => o.id),
      ...orders.flatMap((o) => o.refunds.map((r) => r.id)),
    ];
    const audit = await this.prisma.client.auditLog.findMany({
      where: { entityId: { in: ids }, action: { startsWith: 'RAZORPAY_' } },
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const person = (u: { id: string; displayName: string } | null) =>
      u ? { id: u.id, name: u.displayName } : null;
    return {
      mode: 'TEST',
      refunds: policy.refunds,
      orders: orders.map((o) => {
        const live = o.refunds
          .filter((r) => (LIVE as readonly string[]).includes(r.status))
          .reduce((sum, r) => sum + r.amountMinor, 0);
        return {
          id: o.id,
          attempt: o.attempt,
          status: o.status,
          paymentState: paymentState(o.status, o.events),
          refundState: o.status === 'PAID' ? refundState(o.amountMinor, o.refunds) : 'NONE',
          refundableMinor: o.status === 'PAID' ? Math.max(0, o.amountMinor - live) : 0,
          providerOrderId: o.providerOrderId,
          providerPaymentId: o.providerPaymentId,
          amountMinor: o.amountMinor,
          currency: o.currency,
          createdAt: o.createdAt.toISOString(),
          events: o.events.map((e) => ({
            kind: e.kind,
            reason: e.reason,
            createdAt: e.createdAt.toISOString(),
          })),
        };
      }),
      refundRequests: orders.flatMap((o) =>
        o.refunds.map((r) => ({
          id: r.id,
          amountMinor: r.amountMinor,
          currency: r.currency,
          reason: r.reason,
          status: r.status,
          providerRefundId: r.providerRefundId,
          failureReason: r.failureReason,
          requestedBy: person(r.requestedBy),
          approvedBy: person(r.approvedBy),
          createdAt: r.createdAt.toISOString(),
          decidedAt: r.decidedAt?.toISOString() ?? null,
          events: r.events.map((e) => ({ kind: e.kind, createdAt: e.createdAt.toISOString() })),
        })),
      ),
      audit: audit.map((a) => ({
        action: a.action,
        actor: a.actor?.displayName ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
