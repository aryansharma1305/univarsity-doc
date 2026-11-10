import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const amount = z.number().int().min(1).max(1_000_000_000);
const currency = z.string().regex(/^[A-Z]{3}$/);
const orderRequestSchema = z
  .object({ requestId: z.uuid(), reference: z.uuid(), amountMinor: amount, currency })
  .strict();
const refundRequestSchema = z
  .object({ requestId: z.uuid(), orderId: z.uuid(), amountMinor: amount })
  .strict();
const eventSchema = z
  .object({
    contractVersion: z.literal(1),
    environment: z.literal('SYNTHETIC_SANDBOX'),
    eventId: z.uuid(),
    orderId: z.uuid(),
    reference: z.uuid(),
    type: z.enum(['ORDER_PAID', 'ORDER_FAILED']),
    amountMinor: amount,
    currency,
  })
  .strict();

export type PaymentOrderRequest = z.infer<typeof orderRequestSchema>;
export type PaymentRefundRequest = z.infer<typeof refundRequestSchema>;
export type PaymentEvent = z.infer<typeof eventSchema>;
export interface PaymentOrder {
  environment: 'SYNTHETIC_SANDBOX';
  orderId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  refundedMinor: number;
  status: 'CREATED' | 'PAID' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
}
export interface PaymentReceipt {
  environment: 'SYNTHETIC_SANDBOX';
  kind: 'PAYMENT' | 'REFUND';
  receiptId: string;
  orderId: string;
  reference: string;
  amountMinor: number;
  currency: string;
}

/** Production adapters require a separate approved persistence, authorization and gateway contract. */
export interface PaymentProvider {
  createOrder(request: PaymentOrderRequest): Promise<PaymentOrder>;
  refund(request: PaymentRefundRequest): Promise<PaymentReceipt>;
  reconcile(orderId: string): Promise<{ order: PaymentOrder; receipts: PaymentReceipt[] }>;
}

export interface MockWebhookHeaders {
  timestamp: string;
  signature: string;
}
const webhookHeadersSchema = z
  .object({
    timestamp: z.string().regex(/^\d{10}$/),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const refuse = () => new Error('Synthetic payment operation refused.');

/**
 * Test-only deterministic state transitions. No HTTP client, database, merchant or university writes.
 * shortcut: in-memory receipts are not durable; a real adapter needs atomic persistent receipts.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly #secret: Buffer;
  readonly #maximumSkewSeconds: number;
  readonly #orders = new Map<string, PaymentOrder>();
  readonly #orderRequests = new Map<string, { digest: string; orderId: string }>();
  readonly #events = new Map<string, { digest: string; receipt: PaymentReceipt | null }>();
  readonly #refunds = new Map<string, { digest: string; receipt: PaymentReceipt }>();

  constructor(value: unknown) {
    const config = z
      .object({
        environment: z.literal('SYNTHETIC_SANDBOX'),
        secret: z
          .string()
          .min(32)
          .max(128)
          .refine((s) => Buffer.byteLength(s) >= 32 && Buffer.byteLength(s) <= 128),
        maximumSkewSeconds: z.number().int().min(1).max(300),
      })
      .strict()
      .safeParse(value);
    if (process.env.NODE_ENV !== 'test' || !config.success) throw refuse();
    this.#secret = Buffer.from(config.data.secret);
    this.#maximumSkewSeconds = config.data.maximumSkewSeconds;
  }

  createOrder(value: PaymentOrderRequest): Promise<PaymentOrder> {
    return Promise.resolve().then(() => {
      const request = orderRequestSchema.parse(value);
      const fingerprint = digest(request);
      const previous = this.#orderRequests.get(request.requestId);
      if (previous) {
        if (previous.digest !== fingerprint) throw refuse();
        return structuredClone(this.order(previous.orderId));
      }
      const order: PaymentOrder = {
        environment: 'SYNTHETIC_SANDBOX',
        orderId: randomUUID(),
        reference: request.reference,
        amountMinor: request.amountMinor,
        currency: request.currency,
        refundedMinor: 0,
        status: 'CREATED',
      };
      this.#orders.set(order.orderId, order);
      this.#orderRequests.set(request.requestId, { digest: fingerprint, orderId: order.orderId });
      return structuredClone(order);
    });
  }

  /** Mock signature protocol only; never describes a real gateway's signature scheme. */
  signWebhook(rawBody: Buffer, timestamp: string): MockWebhookHeaders {
    return {
      timestamp,
      signature: createHmac('sha256', this.#secret)
        .update(timestamp)
        .update('.')
        .update(rawBody)
        .digest('hex'),
    };
  }

  verifyWebhook(rawBody: Buffer, headerValue: unknown, now: Date): PaymentEvent {
    const parsed = webhookHeadersSchema.safeParse(headerValue);
    if (!parsed.success || !Buffer.isBuffer(rawBody) || !(now instanceof Date)) throw refuse();
    const headers = parsed.data;
    if (
      rawBody.length > 16_384 ||
      !Number.isFinite(now.getTime()) ||
      Math.abs(Math.floor(now.getTime() / 1000) - Number(headers.timestamp)) >
        this.#maximumSkewSeconds
    )
      throw refuse();
    const expected = this.signWebhook(rawBody, headers.timestamp).signature;
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(headers.signature, 'hex')))
      throw refuse();
    try {
      return eventSchema.parse(JSON.parse(rawBody.toString('utf8')));
    } catch {
      throw refuse();
    }
  }

  handleWebhook(
    rawBody: Buffer,
    headers: MockWebhookHeaders,
    now: Date,
  ): Promise<PaymentReceipt | null> {
    return Promise.resolve().then(() => {
      const event = this.verifyWebhook(rawBody, headers, now);
      const fingerprint = digest(event);
      const previous = this.#events.get(event.eventId);
      if (previous) {
        if (previous.digest !== fingerprint) throw refuse();
        return structuredClone(previous.receipt);
      }
      const order = this.order(event.orderId);
      if (
        event.reference !== order.reference ||
        event.amountMinor !== order.amountMinor ||
        event.currency !== order.currency ||
        order.status !== 'CREATED'
      )
        throw refuse();
      const receipt: PaymentReceipt | null =
        event.type === 'ORDER_PAID'
          ? {
              environment: 'SYNTHETIC_SANDBOX',
              kind: 'PAYMENT',
              receiptId: event.eventId,
              orderId: order.orderId,
              reference: order.reference,
              amountMinor: order.amountMinor,
              currency: order.currency,
            }
          : null;
      order.status = event.type === 'ORDER_PAID' ? 'PAID' : 'FAILED';
      this.#events.set(event.eventId, { digest: fingerprint, receipt });
      return structuredClone(receipt);
    });
  }

  refund(value: PaymentRefundRequest): Promise<PaymentReceipt> {
    return Promise.resolve().then(() => {
      const request = refundRequestSchema.parse(value);
      const fingerprint = digest(request);
      const previous = this.#refunds.get(request.requestId);
      if (previous) {
        if (previous.digest !== fingerprint) throw refuse();
        return structuredClone(previous.receipt);
      }
      const order = this.order(request.orderId);
      if (
        !['PAID', 'PARTIALLY_REFUNDED'].includes(order.status) ||
        request.amountMinor > order.amountMinor - order.refundedMinor
      )
        throw refuse();
      const receipt: PaymentReceipt = {
        environment: 'SYNTHETIC_SANDBOX',
        kind: 'REFUND',
        receiptId: randomUUID(),
        orderId: order.orderId,
        reference: order.reference,
        amountMinor: request.amountMinor,
        currency: order.currency,
      };
      order.refundedMinor += request.amountMinor;
      order.status = order.refundedMinor === order.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      this.#refunds.set(request.requestId, { digest: fingerprint, receipt });
      return structuredClone(receipt);
    });
  }

  reconcile(orderId: string): Promise<{ order: PaymentOrder; receipts: PaymentReceipt[] }> {
    return Promise.resolve().then(() => ({
      order: structuredClone(this.order(z.uuid().parse(orderId))),
      receipts: structuredClone(
        [
          ...[...this.#events.values()].flatMap((e) => (e.receipt ? [e.receipt] : [])),
          ...[...this.#refunds.values()].map((r) => r.receipt),
        ].filter((r) => r.orderId === orderId),
      ),
    }));
  }

  private order(id: string): PaymentOrder {
    const order = this.#orders.get(id);
    if (!order) throw refuse();
    return order;
  }
}
