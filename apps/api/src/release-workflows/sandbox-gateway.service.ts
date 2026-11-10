import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MockPaymentProvider, type PaymentOrder, type PaymentReceipt } from '@docversity/payments';
import type { Prisma } from '@docversity/database';
import type { SandboxCallback, SandboxRefund, SandboxOrder } from '@docversity/validation';
import { AUDIT_ACTIONS } from '@docversity/types';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { ReExamPaymentsService } from '../re-exams/re-exam-payments.service.js';
import { isUsable } from '../re-exams/payment-destinations.service.js';
import { Errors } from '../common/app-error.js';
import {
  WorkflowPolicyService,
  workflowConflict,
  workflowDigest,
} from './workflow-policy.service.js';
type StoredOrder = Prisma.SandboxGatewayOrderGetPayload<{
  select: {
    id: true;
    paymentId: true;
    amountMinor: true;
    currency: true;
    status: true;
    refundedMinor: true;
  };
}>;
const states = z.enum(['CREATED', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED']);
@Injectable()
export class SandboxGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: WorkflowPolicyService,
    private readonly audit: AuditService,
    private readonly payments: ReExamPaymentsService,
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
  ) {}
  private present(o: StoredOrder): PaymentOrder {
    return {
      environment: 'SYNTHETIC_SANDBOX',
      orderId: o.id,
      reference: o.paymentId,
      amountMinor: o.amountMinor,
      currency: o.currency,
      refundedMinor: o.refundedMinor,
      status: states.parse(o.status),
    };
  }
  async create(studentId: string, body: SandboxOrder) {
    const policy = this.policy.current();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM re_exam_payments WHERE id=${body.paymentId}::uuid FOR UPDATE`;
      const payment = await tx.reExamPayment.findUnique({
        where: { id: body.paymentId },
        include: { application: true, destination: true },
      });
      if (
        payment?.studentId !== studentId ||
        !policy.registrationIds.includes(payment.application.studentRegistrationId)
      )
        throw Errors.notFound();
      const digest = workflowDigest({
        body,
        studentId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      });
      const prior = await tx.sandboxGatewayOrder.findUnique({ where: { id: body.requestId } });
      if (prior) {
        if (prior.requestDigest !== digest) throw workflowConflict();
        return this.present(prior);
      }
      if (
        payment.status !== 'AWAITING_PAYMENT' ||
        payment.application.feeStatus !== 'ASSESSED' ||
        ['CANCELLED', 'REJECTED'].includes(payment.application.status) ||
        !isUsable(payment.destination)
      )
        throw workflowConflict();
      const order = await tx.sandboxGatewayOrder.create({
        data: {
          id: body.requestId,
          paymentId: payment.id,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          requestDigest: digest,
        },
      });
      await this.audit.writeAuditEvent(
        {
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'SandboxGatewayOrder',
          entityId: order.id,
          metadata: {
            action: 'CREATE_ORDER',
            paymentId: payment.id,
            financialActivationAllowed: false,
          },
        },
        tx,
      );
      return this.present(order);
    });
  }
  async callback(body: SandboxCallback, clientIp: string) {
    const policy = this.policy.current();
    const rate = await this.limiter.hit(
      'sandbox-callback',
      [{ key: this.hasher.hash('sandbox-callback', clientIp), limit: 30 }],
      60,
    );
    if (rate.limited) throw Errors.rateLimited(rate.retryAfterSeconds);
    const raw = Buffer.from(body.payloadBase64, 'base64');
    if (raw.length > 16384 || raw.toString('base64') !== body.payloadBase64)
      throw Errors.validation([{ path: 'callback', message: 'Synthetic callback refused.' }]);
    const provider = new MockPaymentProvider({
      environment: 'SYNTHETIC_SANDBOX',
      secret: policy.gatewaySecret,
      maximumSkewSeconds: 300,
    });
    let event;
    try {
      event = provider.verifyWebhook(
        raw,
        { timestamp: body.timestamp, signature: body.signature },
        new Date(),
      );
    } catch {
      throw Errors.validation([{ path: 'callback', message: 'Synthetic callback refused.' }]);
    }
    const digest = workflowDigest(event);
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sandbox_gateway_orders WHERE id=${event.orderId}::uuid FOR UPDATE`;
      const order = await tx.sandboxGatewayOrder.findUnique({
        where: { id: event.orderId },
        include: { payment: { include: { application: true } } },
      });
      if (
        !order ||
        !policy.registrationIds.includes(order.payment.application.studentRegistrationId) ||
        order.paymentId !== event.reference ||
        order.amountMinor !== event.amountMinor ||
        order.currency !== event.currency
      )
        throw Errors.notFound();
      const prior = await tx.sandboxGatewayReceipt.findUnique({ where: { id: event.eventId } });
      if (prior) {
        if (prior.orderId !== order.id || prior.requestDigest !== digest) throw workflowConflict();
        return {
          receiptId: prior.id,
          order: this.present(order),
          financialActivationAllowed: false,
        };
      }
      if (order.status !== 'CREATED') throw workflowConflict();
      if (event.type === 'ORDER_PAID') {
        const account = await tx.studentAccount.findUnique({
          where: { studentId: order.payment.studentId },
        });
        if (account?.status !== 'ACTIVE') throw Errors.notFound();
        await this.payments.persistSubmission(
          tx,
          order.payment.studentId,
          account.id,
          order.paymentId,
          { transactionReference: `MOCK-${event.eventId}` },
          null,
          null,
          { providerEventId: event.eventId, providerOrderId: order.id },
        );
      }
      const changed = await tx.sandboxGatewayOrder.update({
        where: { id: order.id },
        data: { status: event.type === 'ORDER_PAID' ? 'PAID' : 'FAILED' },
      });
      await tx.sandboxGatewayReceipt.create({
        data: {
          id: event.eventId,
          orderId: order.id,
          kind: event.type === 'ORDER_PAID' ? 'PAYMENT' : 'FAILURE',
          amountMinor: event.type === 'ORDER_PAID' ? order.amountMinor : 0,
          requestDigest: digest,
        },
      });
      await this.audit.writeAuditEvent(
        {
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'SandboxGatewayOrder',
          entityId: order.id,
          metadata: {
            action: event.type,
            receiptId: event.eventId,
            financialActivationAllowed: false,
          },
        },
        tx,
      );
      return {
        receiptId: event.eventId,
        order: this.present(changed),
        financialActivationAllowed: false,
      };
    });
  }
  async refund(id: string, body: SandboxRefund, actor: string) {
    const policy = this.policy.current();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sandbox_gateway_orders WHERE id=${id}::uuid FOR UPDATE`;
      const order = await tx.sandboxGatewayOrder.findUnique({
        where: { id },
        include: { payment: { include: { application: true } } },
      });
      if (
        !order ||
        !policy.registrationIds.includes(order.payment.application.studentRegistrationId)
      )
        throw Errors.notFound();
      const digest = workflowDigest({ id, body, actor });
      const prior = await tx.sandboxGatewayReceipt.findUnique({ where: { id: body.requestId } });
      if (prior) {
        if (prior.kind !== 'REFUND' || prior.orderId !== id || prior.requestDigest !== digest)
          throw workflowConflict();
        return this.refundReceipt(prior, order);
      }
      if (
        !['PAID', 'PARTIALLY_REFUNDED'].includes(order.status) ||
        body.amountMinor > order.amountMinor - order.refundedMinor
      )
        throw workflowConflict();
      const refunded = order.refundedMinor + body.amountMinor;
      await tx.sandboxGatewayOrder.update({
        where: { id },
        data: {
          refundedMinor: refunded,
          status: refunded === order.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
      const receipt = await tx.sandboxGatewayReceipt.create({
        data: {
          id: body.requestId,
          orderId: id,
          kind: 'REFUND',
          amountMinor: body.amountMinor,
          requestDigest: digest,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'SandboxGatewayOrder',
          entityId: id,
          metadata: {
            action: 'MOCK_REFUND',
            receiptId: receipt.id,
            financialActivationAllowed: false,
          },
        },
        tx,
      );
      return this.refundReceipt(receipt, order);
    });
  }
  private refundReceipt(r: { id: string; amountMinor: number }, o: StoredOrder): PaymentReceipt {
    return {
      environment: 'SYNTHETIC_SANDBOX',
      kind: 'REFUND',
      receiptId: r.id,
      orderId: o.id,
      reference: o.paymentId,
      amountMinor: r.amountMinor,
      currency: o.currency,
    };
  }
  async reconcile(id: string) {
    const policy = this.policy.current();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sandbox_gateway_orders WHERE id=${id}::uuid FOR SHARE`;
      const order = await tx.sandboxGatewayOrder.findUnique({
        where: { id },
        include: {
          receipts: { orderBy: { createdAt: 'asc' } },
          payment: { include: { application: true } },
        },
      });
      if (
        !order ||
        !policy.registrationIds.includes(order.payment.application.studentRegistrationId)
      )
        throw Errors.notFound();
      const paid = order.receipts.filter((r) => r.kind === 'PAYMENT');
      const refunded = order.receipts
        .filter((r) => r.kind === 'REFUND')
        .reduce((sum, r) => sum + r.amountMinor, 0);
      if (
        refunded !== order.refundedMinor ||
        paid.length > (['CREATED', 'FAILED'].includes(order.status) ? 0 : 1) ||
        (!['CREATED', 'FAILED'].includes(order.status) &&
          (paid.length !== 1 || paid[0]?.amountMinor !== order.amountMinor))
      )
        throw workflowConflict();
      return {
        order: this.present(order),
        receipts: order.receipts.flatMap((r): PaymentReceipt[] =>
          r.kind === 'PAYMENT'
            ? [{ ...this.refundReceipt(r, order), kind: 'PAYMENT' }]
            : r.kind === 'REFUND'
              ? [this.refundReceipt(r, order)]
              : [],
        ),
        financialActivationAllowed: false,
      };
    });
  }
}
