import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyRazorpayWebhook } from '../src/razorpay.js';
const secret = 'synthetic-webhook-secret-only-00000000000';
const merchant = 'acc_Synthetic';
const payload = (overrides = {}) => ({
  entity: 'event',
  account_id: merchant,
  event: 'payment.captured',
  created_at: 1794310000,
  payload: {
    payment: {
      entity: {
        id: 'pay_Synthetic',
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        captured: true,
        amount_refunded: 0,
        email: 'synthetic@example.test',
        notes: { applicationId: 'untrusted' },
        ...overrides,
      },
    },
  },
});
const sign = (raw: Buffer) => createHmac('sha256', secret).update(raw).digest('hex');
const verify = (body: unknown, signature?: string) => {
  const raw = Buffer.from(JSON.stringify(body));
  return verifyRazorpayWebhook(raw, signature ?? sign(raw), 'evt_Synthetic', secret, merchant);
};
describe('Razorpay original-byte verification', () => {
  it('checks merchant identity and strips customer data and untrusted notes', () => {
    const result = verify(payload());
    expect(result).toMatchObject({
      amountMinor: 100000,
      currency: 'INR',
      captured: true,
      providerPaymentId: 'pay_Synthetic',
    });
    expect(JSON.stringify(result)).not.toMatch(/email|notes|applicationId|example.test/);
  });
  it('does not verify reserialized bytes', () => {
    const raw = Buffer.from(JSON.stringify(payload(), null, 2));
    expect(() =>
      verifyRazorpayWebhook(
        Buffer.from(JSON.stringify(payload())),
        sign(raw),
        'evt_Synthetic',
        secret,
        merchant,
      ),
    ).toThrow();
  });
  it.each(['', 'x', 'f'.repeat(64), 'A'.repeat(64)])(
    'rejects invalid signature %s',
    (signature) => {
      expect(() => verify(payload(), signature)).toThrow();
    },
  );
  it('rejects a different merchant with a valid signature', () => {
    expect(() => verify({ ...payload(), account_id: 'acc_Other' })).toThrow();
  });
  it.each([
    { amount: 0 },
    { amount: 1.1 },
    { currency: 'inr' },
    { captured: false },
    { status: 'authorized' },
    { amount_refunded: 100001 },
  ])('rejects inconsistent money or capture data %j', (fields) => {
    expect(() => verify(payload(fields))).toThrow();
  });
  it('rejects malformed, oversized and missing-byte payloads before persistence', () => {
    for (const raw of [Buffer.from('{'), Buffer.alloc(65537), Buffer.alloc(0)])
      expect(() =>
        verifyRazorpayWebhook(raw, sign(raw), 'evt_Synthetic', secret, merchant),
      ).toThrow();
  });
  it('records failed payment evidence without treating it as captured', () => {
    expect(
      verify({ ...payload({ status: 'failed', captured: false }), event: 'payment.failed' }),
    ).toMatchObject({ captured: false, eventType: 'payment.failed' });
  });
});
