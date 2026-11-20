import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  classifyRazorpayEvent,
  razorpayOrderReceipt,
  razorpaySignatureMatches,
  verifyRazorpayCheckoutSignature,
} from '../src/razorpay.js';

const secret = 'synthetic-webhook-secret-only-00000000000';
const merchant = 'acc_Synthetic';
const payment = (overrides = {}) => ({
  id: 'pay_Synthetic',
  entity: 'payment',
  amount: 100000,
  currency: 'INR',
  status: 'captured',
  captured: true,
  amount_refunded: 0,
  order_id: 'order_Synthetic',
  email: 'synthetic@example.test',
  notes: { applicationId: 'untrusted' },
  ...overrides,
});
const event = (name: string, extra: Record<string, unknown> = {}) => ({
  entity: 'event',
  account_id: merchant,
  event: name,
  created_at: 1794310000,
  payload: { payment: { entity: payment() } },
  ...extra,
});
const classify = (body: unknown) =>
  classifyRazorpayEvent(Buffer.from(JSON.stringify(body)), 'evt_Synthetic', merchant);

describe('Razorpay signed event classification', () => {
  it('reads order_id from payment.captured and keeps no customer data', () => {
    const result = classify(event('payment.captured'));
    expect(result).toMatchObject({
      outcome: 'HANDLED',
      evidence: {
        providerOrderId: 'order_Synthetic',
        eventType: 'payment.captured',
        amountMinor: 100000,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/email|notes|untrusted|example.test/);
  });
  it('handles order.paid only when the order entity matches the payment', () => {
    const orderEntity = {
      id: 'order_Synthetic',
      entity: 'order',
      amount: 100000,
      currency: 'INR',
      status: 'paid',
    };
    const paid = (o: object) =>
      event('order.paid', { payload: { payment: { entity: payment() }, order: { entity: o } } });
    expect(classify(paid(orderEntity))).toMatchObject({
      outcome: 'HANDLED',
      evidence: { eventType: 'order.paid', providerOrderId: 'order_Synthetic' },
    });
    expect(classify(paid({ ...orderEntity, id: 'order_Other' }))).toMatchObject({
      outcome: 'IGNORED',
      reason: 'UNPARSEABLE',
    });
    expect(classify(event('order.paid'))).toMatchObject({
      outcome: 'IGNORED',
      reason: 'UNPARSEABLE',
    });
  });
  it('ignores unknown events without parsing their payload', () => {
    for (const name of ['refund.speed_changed', 'payment.dispute.created', 'payment.authorized'])
      expect(classify(event(name, { payload: { anything: true } }))).toMatchObject({
        outcome: 'IGNORED',
        reason: 'UNHANDLED_EVENT',
        eventType: name,
      });
  });
  it('parses refund events by the refund entity, and refuses inconsistent ones', () => {
    const refund = (name: string, status: string) =>
      event(name, {
        payload: {
          refund: {
            entity: {
              id: 'rfnd_Synthetic',
              entity: 'refund',
              amount: 500,
              currency: 'INR',
              payment_id: 'pay_Synthetic',
              status,
              receipt: 'rf_x',
              notes: { a: 'b' },
            },
          },
        },
      });
    expect(classify(refund('refund.processed', 'processed'))).toMatchObject({
      outcome: 'REFUND',
      refund: {
        providerRefundId: 'rfnd_Synthetic',
        amountMinor: 500,
        status: 'processed',
        receipt: 'rf_x',
      },
    });
    expect(JSON.stringify(classify(refund('refund.failed', 'failed')))).not.toContain('notes');
    expect(classify(refund('refund.processed', 'failed'))).toMatchObject({
      outcome: 'IGNORED',
      reason: 'UNPARSEABLE',
    });
    expect(classify(refund('refund.created', 'failed'))).toMatchObject({
      outcome: 'IGNORED',
      reason: 'UNPARSEABLE',
    });
  });
  it('ignores account mismatches and unparseable bodies instead of throwing', () => {
    expect(classify({ ...event('payment.captured'), account_id: 'acc_Other' })).toMatchObject({
      reason: 'ACCOUNT_MISMATCH',
    });
    expect(
      classify(
        event('payment.captured', {
          payload: { payment: { entity: payment({ status: 'authorized' }) } },
        }),
      ),
    ).toMatchObject({ reason: 'UNPARSEABLE', eventType: 'payment.captured' });
    expect(classifyRazorpayEvent(Buffer.from('not json'), 'evt_X', merchant)).toMatchObject({
      outcome: 'IGNORED',
      reason: 'UNPARSEABLE',
      eventType: null,
      providerCreatedAt: null,
    });
  });
  it('verifies irregular whitespace, escapes and integers above 2^53 byte-for-byte', () => {
    const body = `{ "entity":"event" ,"account_id":"acc_Synthetic","event":"payment.captured","created_at":1794310000,
      "big": 123456789012345678901234567890, "text":"\\u00e9 é \u{1F600}",
      "payload":{"payment":{"entity":{"id":"pay_Synthetic","entity":"payment","amount":100000,"currency":"INR","status":"captured","captured":true,"amount_refunded":0,"order_id":"order_Synthetic"}}}}\n`;
    const raw = Buffer.from(body, 'utf8');
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    expect(razorpaySignatureMatches(raw, signature, secret)).toBe(true);
    expect(classifyRazorpayEvent(raw, 'evt_X', merchant).outcome).toBe('HANDLED');
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(body)));
    expect(razorpaySignatureMatches(reserialized, signature, secret)).toBe(false);
  });
  it('refuses bad signatures, oversize bodies and non-buffers', () => {
    const raw = Buffer.from('{}');
    const good = createHmac('sha256', secret).update(raw).digest('hex');
    expect(razorpaySignatureMatches(raw, good, secret)).toBe(true);
    expect(razorpaySignatureMatches(raw, good.toUpperCase(), secret)).toBe(false);
    expect(razorpaySignatureMatches(raw, '0'.repeat(64), secret)).toBe(false);
    expect(razorpaySignatureMatches('{}', good, secret)).toBe(false);
    const big = Buffer.alloc(65_537);
    expect(
      razorpaySignatureMatches(big, createHmac('sha256', secret).update(big).digest('hex'), secret),
    ).toBe(false);
    expect(razorpaySignatureMatches(raw, good, 'short')).toBe(false);
  });
});

describe('Standard Checkout signature', () => {
  const keySecret = 'synthetic-key-secret-0000';
  const sig = createHmac('sha256', keySecret).update('order_Synthetic|pay_Synthetic').digest('hex');
  it('accepts HMAC-SHA256(order_id|payment_id, key_secret) only', () => {
    expect(
      verifyRazorpayCheckoutSignature('order_Synthetic', 'pay_Synthetic', sig, keySecret),
    ).toBe(true);
    expect(verifyRazorpayCheckoutSignature('order_Synthetic', 'pay_Other', sig, keySecret)).toBe(
      false,
    );
    expect(
      verifyRazorpayCheckoutSignature('order_Synthetic', 'pay_Synthetic', sig, 'other-secret'),
    ).toBe(false);
    expect(verifyRazorpayCheckoutSignature('order_Synthetic', 'pay_Synthetic', 42, keySecret)).toBe(
      false,
    );
    expect(
      verifyRazorpayCheckoutSignature('order_Synthetic|x', 'pay_Synthetic', sig, keySecret),
    ).toBe(false);
  });
});

describe('order receipt', () => {
  it('is derived from the obligation and attempt and fits 40 characters', () => {
    const r = razorpayOrderReceipt('0193a8f0-1111-7222-8333-444455556666', 12);
    expect(r).toBe('rx_0193a8f0111172228333444455556666_12');
    expect(r.length).toBeLessThanOrEqual(40);
    expect(() => razorpayOrderReceipt('x', 1)).toThrow();
    expect(() => razorpayOrderReceipt('0193a8f0-1111-7222-8333-444455556666', 100)).toThrow();
  });
});
