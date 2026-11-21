import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { alertNotifier, type PaymentAlert } from '@docversity/payments/server';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

export type { PaymentAlert };
export type PaymentAlertSink = (alert: PaymentAlert) => Promise<void> | void;
/** Test seam / custom delivery. Without it: PAYMENTS_ALERT_WEBHOOK_URL (https POST) or the log. */
export const PAYMENT_ALERT_SINK = Symbol('PAYMENT_ALERT_SINK');

@Injectable()
export class PaymentAlertsService {
  private readonly logger = new Logger('PaymentAlerts');
  private readonly deliver: (alert: PaymentAlert) => Promise<void>;
  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    @Optional() @Inject(PAYMENT_ALERT_SINK) sink?: PaymentAlertSink,
  ) {
    const log = (alert: PaymentAlert) => {
      this.logger.warn({ msg: 'payment alert', ...alert });
      return Promise.resolve();
    };
    this.deliver = sink
      ? async (alert) => {
          await sink(alert);
        }
      : alertNotifier(config.PAYMENTS_ALERT_WEBHOOK_URL, log);
  }
  /** Never throws: an alert failure must not turn a stored webhook into a retried 5xx. */
  async notify(alert: PaymentAlert): Promise<void> {
    try {
      await this.deliver(alert);
    } catch {
      this.logger.error({ msg: 'payment alert delivery failed', kind: alert.kind });
    }
  }
}
