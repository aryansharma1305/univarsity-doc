import { Injectable } from '@nestjs/common';
import {
  reconcileRazorpay,
  type ReconciliationIssue,
  type ReconciliationSummary,
} from '@docversity/payments/server';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PaymentAlertsService } from './payment-alerts.service.js';
import {
  PaymentButtonPolicyService,
  RazorpayGatewayService,
} from './payment-button-policy.service.js';
import { RazorpayOrdersService } from './razorpay-orders.service.js';

export type { ReconciliationIssue, ReconciliationSummary };

/**
 * TEST-mode reconciliation (shared core, @docversity/payments/server). The worker runs the same
 * function on a schedule; this service backs the `razorpay:reconcile` CLI. 404 when the mode is off.
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

  run(now = new Date(), lookbackDays = 3): Promise<ReconciliationSummary> {
    this.policy.requireFixture();
    return reconcileRazorpay({
      prisma: this.prisma.client,
      client: this.gateway.client(),
      audit: (entry, tx) => this.audit.writeAuditEvent(entry, tx),
      notify: (alert) => this.alerts.notify(alert),
      now,
      lookbackDays,
      orderTtlMs: this.orders.orderTtlMs,
    });
  }
}
