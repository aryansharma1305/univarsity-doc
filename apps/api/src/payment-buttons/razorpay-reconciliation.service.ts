import { Injectable } from '@nestjs/common';
import { RazorpayApiError, type RazorpayPayment } from '@docversity/payments';
import { AUDIT_ACTIONS } from '@docversity/types';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PaymentAlertsService } from './payment-alerts.service.js';
import {
  PaymentButtonPolicyService,
  RazorpayGatewayService,
} from './payment-button-policy.service.js';
import { RazorpayOrdersService } from './razorpay-orders.service.js';

export interface ReconciliationIssue {
  code:
    | 'PAID_ORDER_PAYMENT_MISSING'
    | 'PAID_ORDER_DRIFT'
    | 'CAPTURE_WITHOUT_WEBHOOK'
    | 'CAPTURE_UNMATCHED'
    | 'SETTLEMENT_AMOUNT_DRIFT'
    | 'PROVIDER_UNAVAILABLE';
  orderId: string | null;
  providerPaymentId: string | null;
  driftMinor: number;
}
export interface ReconciliationSummary {
  ordersChecked: number;
  rematched: number;
  issues: ReconciliationIssue[];
  driftMinor: number;
  settlement: 'CHECKED' | 'EMPTY' | 'UNAVAILABLE';
}

const clean = (p: RazorpayPayment, amount: number, currency: string) =>
  p.status === 'captured' &&
  p.captured &&
  p.amount_refunded === 0 &&
  p.amount === amount &&
  p.currency === currency;

/**
 * Daily test-mode reconciliation: every recent order against Razorpay's own record of its payments,
 * then the previous day's settlement recon rows. Captures flagged PROVIDER_UNVERIFIED (never final)
 * are re-matched once the provider answers. Never fulfils without a signed webhook receipt.
 */
@Injectable()
export class RazorpayReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PaymentButtonPolicyService,
    private readonly gateway: RazorpayGatewayService,
    private readonly orders: RazorpayOrdersService,
    private readonly audit: AuditService,
    private readonly alerts: PaymentAlertsService,
  ) {}

  async run(now = new Date(), lookbackDays = 3): Promise<ReconciliationSummary> {
    this.policy.requireFixture();
    const client = this.gateway.client();
    const since = new Date(now.getTime() - lookbackDays * 86_400_000);
    const orders = await this.prisma.client.razorpayOrder.findMany({
      where: {
        status: { in: ['CREATED', 'PAID'] },
        providerOrderId: { not: null },
        updatedAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const issues: ReconciliationIssue[] = [];
    let rematched = 0;
    for (const order of orders) {
      const providerOrderId = order.providerOrderId ?? '';
      let payments: RazorpayPayment[];
      try {
        payments = await client.fetchOrderPayments(providerOrderId);
      } catch (error) {
        if (!(error instanceof RazorpayApiError)) throw error;
        issues.push({
          code: 'PROVIDER_UNAVAILABLE',
          orderId: order.id,
          providerPaymentId: null,
          driftMinor: 0,
        });
        continue;
      }
      if (order.status === 'PAID') {
        const paid = payments.find((p) => p.id === order.providerPaymentId);
        if (!paid)
          issues.push({
            code: 'PAID_ORDER_PAYMENT_MISSING',
            orderId: order.id,
            providerPaymentId: order.providerPaymentId,
            driftMinor: order.amountMinor,
          });
        else if (!clean(paid, order.amountMinor, order.currency))
          issues.push({
            code: 'PAID_ORDER_DRIFT',
            orderId: order.id,
            providerPaymentId: paid.id,
            driftMinor: order.amountMinor - (paid.amount - paid.amount_refunded),
          });
        continue;
      }
      for (const captured of payments.filter((p) => p.captured)) {
        const receipt = await this.prisma.client.razorpayWebhookReceipt.findFirst({
          where: { providerPaymentId: captured.id, providerOrderId, captured: true },
          orderBy: { createdAt: 'desc' },
        });
        if (!receipt) {
          issues.push({
            code: 'CAPTURE_WITHOUT_WEBHOOK',
            orderId: order.id,
            providerPaymentId: captured.id,
            driftMinor: captured.amount,
          });
          continue;
        }
        const last = await this.prisma.client.razorpayOrderEvent.findFirst({
          where: { orderId: order.id, receiptId: receipt.id, kind: 'FLAGGED' },
          orderBy: { createdAt: 'desc' },
        });
        if (last?.reason === 'PROVIDER_UNVERIFIED') {
          const match = await this.prisma.client.$transaction((tx) =>
            this.orders.matchCapture(tx, receipt, captured),
          );
          if (match.matched) {
            rematched++;
            continue;
          }
        }
        issues.push({
          code: 'CAPTURE_UNMATCHED',
          orderId: order.id,
          providerPaymentId: captured.id,
          driftMinor: captured.amount,
        });
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
        const order = await this.prisma.client.razorpayOrder.findUnique({
          where: { providerOrderId: row.order_id ?? '' },
        });
        if (order && row.amount !== order.amountMinor)
          issues.push({
            code: 'SETTLEMENT_AMOUNT_DRIFT',
            orderId: order.id,
            providerPaymentId: row.payment_id ?? null,
            driftMinor: order.amountMinor - row.amount,
          });
      }
    } catch (error) {
      if (!(error instanceof RazorpayApiError)) throw error;
    }

    const driftMinor = issues.reduce((sum, issue) => sum + Math.abs(issue.driftMinor), 0);
    const counts = Object.fromEntries(
      [...new Set(issues.map((i) => i.code))].map((code) => [
        code,
        issues.filter((i) => i.code === code).length,
      ]),
    );
    await this.audit.writeAuditEvent({
      action: AUDIT_ACTIONS.razorpayReconciliationRun,
      entityType: 'RazorpayReconciliationRun',
      entityId: null,
      metadata: {
        ordersChecked: orders.length,
        rematched,
        issues: counts,
        driftMinor,
        settlement,
        mode: 'TEST',
      },
    });
    if (issues.length > 0)
      await this.alerts.notify({
        kind: 'RECONCILIATION_ISSUES',
        severity: driftMinor > 0 ? 'critical' : 'warning',
        details: { issues: issues.length, driftMinor, ordersChecked: orders.length, settlement },
      });
    return { ordersChecked: orders.length, rematched, issues, driftMinor, settlement };
  }
}
