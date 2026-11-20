import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type { PaymentAlert } from '@docversity/payments/server';

export type { PaymentAlert };
export type PaymentAlertSink = (alert: PaymentAlert) => Promise<void> | void;
/** Pluggable delivery (e-mail, chat, pager). Default: one structured warning log line. */
export const PAYMENT_ALERT_SINK = Symbol('PAYMENT_ALERT_SINK');

@Injectable()
export class PaymentAlertsService {
  private readonly logger = new Logger('PaymentAlerts');
  constructor(@Optional() @Inject(PAYMENT_ALERT_SINK) private readonly sink?: PaymentAlertSink) {}
  /** Never throws: an alert failure must not turn a stored webhook into a retried 5xx. */
  async notify(alert: PaymentAlert): Promise<void> {
    try {
      if (this.sink) await this.sink(alert);
      else this.logger.warn({ msg: 'payment alert', ...alert });
    } catch {
      this.logger.error({ msg: 'payment alert delivery failed', kind: alert.kind });
    }
  }
}
