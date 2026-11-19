import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const MAX_WEBHOOK_BYTES = 65_536;
const paymentIdPattern = /^pay_[A-Za-z0-9]{1,50}$/;
const orderIdPattern = /^order_[A-Za-z0-9]{1,50}$/;
const accountIdPattern = /^acc_[A-Za-z0-9]{1,50}$/;

/** Events whose payload is parsed and stored as evidence. Every other signed event is ignored (2xx). */
export const RAZORPAY_HANDLED_EVENTS = [
  'payment.captured',
  'payment.failed',
  'order.paid',
] as const;
export type RazorpayHandledEvent = (typeof RAZORPAY_HANDLED_EVENTS)[number];

const paymentSchema = z.object({
  id: z.string().regex(paymentIdPattern),
  entity: z.literal('payment'),
  amount: z.number().int().min(1).max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['captured', 'failed']),
  captured: z.boolean(),
  amount_refunded: z.number().int().min(0).max(1_000_000_000),
  order_id: z.string().regex(orderIdPattern).nullish(),
});
const orderSchema = z.object({
  id: z.string().regex(orderIdPattern),
  entity: z.literal('order'),
  amount: z.number().int().min(1).max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.literal('paid'),
});
// Only the envelope is read before the event type is known; unknown events keep no payload.
const envelopeSchema = z.object({
  entity: z.literal('event'),
  account_id: z.string().max(64),
  event: z.string().regex(/^[a-z][a-z._]{0,63}$/),
  created_at: z.number().int().min(1).max(4_102_444_800),
});
const payloadSchema = z.object({
  payment: z.object({ entity: paymentSchema }),
  order: z.object({ entity: orderSchema }).optional(),
});

export type RazorpayIgnoreReason = 'UNHANDLED_EVENT' | 'UNPARSEABLE' | 'ACCOUNT_MISMATCH';
export interface RazorpayEvidence {
  eventId: string;
  bodySha256: string;
  merchantId: string;
  providerPaymentId: string;
  providerOrderId: string | null;
  eventType: RazorpayHandledEvent;
  amountMinor: number;
  currency: string;
  captured: boolean;
  amountRefunded: number;
  providerCreatedAt: Date;
}
export type RazorpayClassifiedEvent =
  | { outcome: 'HANDLED'; evidence: RazorpayEvidence }
  | {
      outcome: 'IGNORED';
      reason: RazorpayIgnoreReason;
      eventId: string;
      eventType: string | null;
      bodySha256: string;
      providerCreatedAt: Date | null;
    };

export function isRazorpayEventId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** HMAC-SHA256 of the original bytes with the webhook secret, compared in constant time. */
export function razorpaySignatureMatches(
  raw: unknown,
  signature: unknown,
  secret: string,
): raw is Buffer {
  if (
    !Buffer.isBuffer(raw) ||
    raw.length === 0 ||
    raw.length > MAX_WEBHOOK_BYTES ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Buffer.byteLength(secret) < 32 ||
    Buffer.byteLength(secret) > 256
  )
    return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * Classifies a body whose signature has ALREADY been verified. Never throws: a signed body is
 * authentic, so anything we cannot use is reported as IGNORED (answered 2xx so Razorpay never
 * disables the webhook), never as a client error.
 */
export function classifyRazorpayEvent(
  raw: Buffer,
  eventId: string,
  merchantId: string,
): RazorpayClassifiedEvent {
  const bodySha256 = createHash('sha256').update(raw).digest('hex');
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    json = undefined;
  }
  const envelope = envelopeSchema.safeParse(json);
  const ignored = (reason: RazorpayIgnoreReason): RazorpayClassifiedEvent => ({
    outcome: 'IGNORED',
    reason,
    eventId,
    eventType: envelope.success ? envelope.data.event : null,
    bodySha256,
    providerCreatedAt: envelope.success ? new Date(envelope.data.created_at * 1000) : null,
  });
  if (!envelope.success) return ignored('UNPARSEABLE');
  const e = envelope.data;
  if (!accountIdPattern.test(e.account_id) || e.account_id !== merchantId)
    return ignored('ACCOUNT_MISMATCH');
  if (!(RAZORPAY_HANDLED_EVENTS as readonly string[]).includes(e.event))
    return ignored('UNHANDLED_EVENT');
  const payload = payloadSchema.safeParse((json as { payload?: unknown }).payload);
  if (!payload.success) return ignored('UNPARSEABLE');
  const p = payload.data.payment.entity;
  const order = payload.data.order?.entity;
  const consistent =
    p.amount_refunded <= p.amount &&
    (e.event === 'payment.failed'
      ? p.status === 'failed' && !p.captured
      : p.status === 'captured' && p.captured) &&
    (e.event !== 'order.paid' ||
      (!!order && order.id === p.order_id && order.currency === p.currency));
  if (!consistent) return ignored('UNPARSEABLE');
  // Customer identity, card details, notes and any untrusted application reference are dropped.
  return {
    outcome: 'HANDLED',
    evidence: {
      eventId,
      bodySha256,
      merchantId: e.account_id,
      providerPaymentId: p.id,
      providerOrderId: p.order_id ?? null,
      eventType: e.event as RazorpayHandledEvent,
      amountMinor: p.amount,
      currency: p.currency,
      captured: p.captured,
      amountRefunded: p.amount_refunded,
      providerCreatedAt: new Date(e.created_at * 1000),
    },
  };
}

/** Razorpay HMAC is over the original bytes, unlike the mock provider's timestamp protocol. */
export function verifyRazorpayWebhook(
  raw: Buffer,
  signature: unknown,
  eventId: unknown,
  secret: string,
  merchantId: string,
) {
  const refuse = () => new Error('Payment notification could not be verified.');
  if (!isRazorpayEventId(eventId) || !razorpaySignatureMatches(raw, signature, secret))
    throw refuse();
  const result = classifyRazorpayEvent(raw, eventId, merchantId);
  if (result.outcome !== 'HANDLED' || result.evidence.eventType === 'order.paid') throw refuse();
  const { providerOrderId: _orderId, ...evidence } = result.evidence;
  return evidence;
}

/**
 * Standard Checkout handler signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret).
 * A match only shows the browser returned from Checkout; fulfilment waits for the webhook.
 */
export function verifyRazorpayCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: unknown,
  keySecret: string,
): boolean {
  if (
    !orderIdPattern.test(orderId) ||
    !paymentIdPattern.test(paymentId) ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    keySecret.length === 0
  )
    return false;
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/** Business-derived order receipt (Razorpay: unique, at most 40 characters): 38 characters. */
export function razorpayOrderReceipt(obligationId: string, attempt: number): string {
  if (
    !/^[0-9a-f-]{36}$/i.test(obligationId) ||
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt > 99
  )
    throw new Error('Invalid order receipt input.');
  return `rx_${obligationId.replaceAll('-', '').toLowerCase()}_${String(attempt)}`;
}
