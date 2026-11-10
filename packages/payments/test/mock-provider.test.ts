import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockPaymentProvider, type PaymentEvent, type PaymentOrder } from '../src/index.js';

const now = new Date('2026-11-10T00:00:00Z');
const timestamp = String(now.getTime() / 1000);
const mock = () =>
  new MockPaymentProvider({
    environment: 'SYNTHETIC_SANDBOX',
    secret: 'synthetic-mock-secret-with-at-least-32-characters',
    maximumSkewSeconds: 300,
  });
const request = () => ({
  requestId: randomUUID(),
  reference: randomUUID(),
  amountMinor: 10000,
  currency: 'INR',
});
const event = (order: PaymentOrder): PaymentEvent => ({
  contractVersion: 1,
  environment: 'SYNTHETIC_SANDBOX',
  eventId: randomUUID(),
  orderId: order.orderId,
  reference: order.reference,
  type: 'ORDER_PAID',
  amountMinor: order.amountMinor,
  currency: order.currency,
});
const body = (value: unknown) => Buffer.from(JSON.stringify(value));
async function paid(provider: MockPaymentProvider) {
  const order = await provider.createOrder(request());
  const raw = body(event(order));
  await provider.handleWebhook(raw, provider.signWebhook(raw, timestamp), now);
  return order;
}
afterEach(() => vi.unstubAllEnvs());

describe('isolated synthetic payment provider', () => {
  it('refuses construction outside tests or with invalid signing/time settings', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(mock).toThrow('refused');
    vi.stubEnv('NODE_ENV', 'test');
    for (const config of [
      { secret: 'short', maximumSkewSeconds: 300 },
      { secret: 'x'.repeat(129), maximumSkewSeconds: 300 },
      { secret: 'x'.repeat(32), maximumSkewSeconds: 0 },
      { secret: 'x'.repeat(32), maximumSkewSeconds: 301 },
    ])
      expect(
        () => new MockPaymentProvider({ environment: 'SYNTHETIC_SANDBOX', ...config }),
      ).toThrow('refused');
  });

  it('creates one order for concurrent duplicate requests and refuses changed amounts', async () => {
    const p = mock();
    const input = request();
    const orders = await Promise.all(Array.from({ length: 12 }, () => p.createOrder(input)));
    expect(new Set(orders.map((o) => o.orderId)).size).toBe(1);
    await expect(p.createOrder({ ...input, amountMinor: 10001 })).rejects.toThrow('refused');
    expect(orders[0]).toMatchObject({
      environment: 'SYNTHETIC_SANDBOX',
      status: 'CREATED',
      refundedMinor: 0,
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.NaN])(
    'rejects invalid minor amount %s',
    async (amountMinor) => {
      await expect(mock().createOrder({ ...request(), amountMinor })).rejects.toThrow();
    },
  );

  it('accepts only raw-body signatures and a bounded freshness window', async () => {
    const p = mock();
    const order = await p.createOrder(request());
    const raw = body(event(order));
    const headers = p.signWebhook(raw, timestamp);
    expect(p.verifyWebhook(raw, headers, now)).toMatchObject({ orderId: order.orderId });
    expect(() => p.verifyWebhook(Buffer.concat([raw, Buffer.from(' ')]), headers, now)).toThrow(
      'refused',
    );
    for (const h of [
      { ...headers, signature: '0'.repeat(64) },
      { ...headers, signature: 'invalid' },
      { ...headers, timestamp: 'NaN' },
      p.signWebhook(raw, String(Number(timestamp) - 301)),
      p.signWebhook(raw, String(Number(timestamp) + 301)),
    ])
      expect(() => p.verifyWebhook(raw, h, now)).toThrow('refused');
    expect(() => p.verifyWebhook(raw, headers, new Date('invalid'))).toThrow('refused');
    const oversized = Buffer.alloc(16385);
    expect(() => p.verifyWebhook(oversized, p.signWebhook(oversized, timestamp), now)).toThrow(
      'refused',
    );
    const malformed = Buffer.from('{');
    expect(() => p.verifyWebhook(malformed, p.signWebhook(malformed, timestamp), now)).toThrow(
      'refused',
    );
  });

  it('applies concurrent duplicate signed events once with the same receipt', async () => {
    const p = mock();
    const order = await p.createOrder(request());
    const raw = body(event(order));
    const headers = p.signWebhook(raw, timestamp);
    const receipts = await Promise.all(
      Array.from({ length: 12 }, () => p.handleWebhook(raw, headers, now)),
    );
    expect(new Set(receipts.map((r) => r?.receiptId)).size).toBe(1);
    expect(await p.reconcile(order.orderId)).toMatchObject({
      order: { status: 'PAID' },
      receipts: [{ kind: 'PAYMENT', amountMinor: 10000 }],
    });
  });

  it('fails closed on missing or ambiguous callback headers', async () => {
    const p = mock();
    const order = await p.createOrder(request());
    const raw = body(event(order));
    for (const headers of [
      undefined,
      null,
      {},
      { timestamp },
      { timestamp: [timestamp], signature: '0'.repeat(64) },
      { ...p.signWebhook(raw, timestamp), extra: true },
    ])
      expect(() => p.verifyWebhook(raw, headers, now)).toThrow('refused');
    expect((await p.reconcile(order.orderId)).order.status).toBe('CREATED');
  });

  it('binds signed callbacks to the stored reference, currency and exact amount before changing state', async () => {
    const p = mock();
    const order = await p.createOrder(request());
    const valid = event(order);
    for (const changed of [
      { amountMinor: 9999 },
      { currency: 'NPR' },
      { reference: randomUUID() },
      { orderId: randomUUID() },
      { environment: 'LIVE' },
      { extra: 'untrusted' },
    ]) {
      const raw = body({ ...valid, ...changed });
      await expect(p.handleWebhook(raw, p.signWebhook(raw, timestamp), now)).rejects.toThrow(
        'refused',
      );
    }
    expect(await p.reconcile(order.orderId)).toMatchObject({
      order: { status: 'CREATED' },
      receipts: [],
    });
    const raw = body(valid);
    await p.handleWebhook(raw, p.signWebhook(raw, timestamp), now);
  });

  it('rejects reused event IDs with changed content and refuses later terminal downgrades', async () => {
    const p = mock();
    const order = await p.createOrder(request());
    const valid = event(order);
    const raw = body(valid);
    await p.handleWebhook(raw, p.signWebhook(raw, timestamp), now);
    for (const changed of [
      { ...valid, amountMinor: 1 },
      { ...valid, eventId: randomUUID(), type: 'ORDER_FAILED' },
      { ...valid, eventId: randomUUID() },
    ]) {
      const other = body(changed);
      await expect(p.handleWebhook(other, p.signWebhook(other, timestamp), now)).rejects.toThrow(
        'refused',
      );
    }
    expect((await p.reconcile(order.orderId)).receipts).toHaveLength(1);
  });

  it('records failed payments without a financial receipt and refuses refunds before payment', async () => {
    const p = mock();
    const order = await p.createOrder(request());
    await expect(
      p.refund({ requestId: randomUUID(), orderId: order.orderId, amountMinor: 1 }),
    ).rejects.toThrow('refused');
    const raw = body({ ...event(order), type: 'ORDER_FAILED' });
    expect(await p.handleWebhook(raw, p.signWebhook(raw, timestamp), now)).toBeNull();
    expect(await p.reconcile(order.orderId)).toMatchObject({
      order: { status: 'FAILED' },
      receipts: [],
    });
  });

  it('deduplicates refunds and preserves exact partial/full reconciliation totals', async () => {
    const p = mock();
    const order = await paid(p);
    const refund = { requestId: randomUUID(), orderId: order.orderId, amountMinor: 3000 };
    const receipts = await Promise.all(Array.from({ length: 12 }, () => p.refund(refund)));
    expect(new Set(receipts.map((r) => r.receiptId)).size).toBe(1);
    expect((await p.reconcile(order.orderId)).order).toMatchObject({
      status: 'PARTIALLY_REFUNDED',
      refundedMinor: 3000,
    });
    await expect(p.refund({ ...refund, amountMinor: 3001 })).rejects.toThrow('refused');
    await p.refund({ requestId: randomUUID(), orderId: order.orderId, amountMinor: 7000 });
    const state = await p.reconcile(order.orderId);
    expect(state.order).toMatchObject({ status: 'REFUNDED', refundedMinor: 10000 });
    expect(
      state.receipts.filter((r) => r.kind === 'REFUND').reduce((sum, r) => sum + r.amountMinor, 0),
    ).toBe(10000);
    await expect(
      p.refund({ requestId: randomUUID(), orderId: order.orderId, amountMinor: 1 }),
    ).rejects.toThrow('refused');
  });

  it('prevents concurrent over-refunds and does not expose mutable internal records', async () => {
    const p = mock();
    const order = await paid(p);
    const attempts = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        p.refund({ requestId: randomUUID(), orderId: order.orderId, amountMinor: 7000 }),
      ),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const state = await p.reconcile(order.orderId);
    state.order.refundedMinor = 0;
    state.receipts.length = 0;
    expect((await p.reconcile(order.orderId)).order.refundedMinor).toBe(7000);
    expect((await p.reconcile(order.orderId)).receipts).toHaveLength(2);
    expect(JSON.stringify(p)).not.toContain('secret');
  });
});
