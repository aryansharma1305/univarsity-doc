import { describe, expect, it } from 'vitest';
import { REDACTED, redact } from '../src/common/json-logger.js';

describe('log redaction of payment credentials', () => {
  it('redacts Razorpay signatures and secrets at any depth', () => {
    const out = redact({
      headers: { 'x-razorpay-signature': 'ab', 'x-razorpay-event-id': 'evt_1' },
      body: { razorpay_signature: 'cd', razorpay_payment_id: 'pay_1' },
      keySecret: 'x',
      webhookSecret: 'y',
    });
    expect(out).toEqual({
      headers: { 'x-razorpay-signature': REDACTED, 'x-razorpay-event-id': 'evt_1' },
      body: { razorpay_signature: REDACTED, razorpay_payment_id: 'pay_1' },
      keySecret: REDACTED,
      webhookSecret: REDACTED,
    });
  });
});
