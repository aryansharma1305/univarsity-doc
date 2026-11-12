import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]{1,50}$/),
  entity: z.literal('payment'),
  amount: z.number().int().min(1).max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['captured', 'failed']),
  captured: z.boolean(),
  amount_refunded: z.number().int().min(0).max(1_000_000_000),
});
const eventSchema = z.object({
  entity: z.literal('event'),
  account_id: z.string().regex(/^acc_[A-Za-z0-9]{1,50}$/),
  event: z.enum(['payment.captured', 'payment.failed']),
  created_at: z.number().int().min(1).max(4_102_444_800),
  payload: z.object({ payment: z.object({ entity: paymentSchema }) }),
});

/** Razorpay HMAC is over the original bytes, unlike the mock provider's timestamp protocol. */
export function verifyRazorpayWebhook(
  raw: Buffer,
  signature: unknown,
  eventId: unknown,
  secret: string,
  merchantId: string,
) {
  const refuse = () => new Error('Payment notification could not be verified.');
  if (
    !Buffer.isBuffer(raw) ||
    raw.length === 0 ||
    raw.length > 65_536 ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    typeof eventId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(eventId) ||
    Buffer.byteLength(secret) < 32 ||
    Buffer.byteLength(secret) > 256
  )
    throw refuse();
  const expected = createHmac('sha256', secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw refuse();
  let event;
  try {
    event = eventSchema.parse(JSON.parse(raw.toString('utf8')));
  } catch {
    throw refuse();
  }
  const p = event.payload.payment.entity;
  if (
    event.account_id !== merchantId ||
    p.amount_refunded > p.amount ||
    (event.event === 'payment.captured'
      ? p.status !== 'captured' || !p.captured
      : p.status !== 'failed' || p.captured)
  )
    throw refuse();
  // Do not retain customer identity, card details, notes, or an untrusted application reference.
  return {
    eventId,
    bodySha256: createHash('sha256').update(raw).digest('hex'),
    merchantId: event.account_id,
    providerPaymentId: p.id,
    eventType: event.event,
    amountMinor: p.amount,
    currency: p.currency,
    captured: p.captured,
    amountRefunded: p.amount_refunded,
    providerCreatedAt: new Date(event.created_at * 1000),
  };
}
