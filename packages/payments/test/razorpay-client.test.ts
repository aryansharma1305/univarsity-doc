import { describe, expect, it, vi } from 'vitest';
import {
  RAZORPAY_API_BASE,
  RazorpayApiError,
  RazorpayClient,
  fetchRazorpayPort,
  type RazorpayHttpRequest,
  type RazorpayHttpResponse,
} from '../src/razorpay-client.js';

// Synthetic credentials only: no real or test Razorpay key exists in this repository.
const keyId = 'rzp_test_SYNTHETIC';
const keySecret = 'synthetic-key-secret-0000';
const order = {
  id: 'order_Synthetic1',
  entity: 'order',
  amount: 50000,
  currency: 'INR',
  receipt: 'rx_0193_1',
  status: 'created',
  notes: { obligation: 'x' },
};
const payment = {
  id: 'pay_Synthetic1',
  entity: 'payment',
  amount: 50000,
  currency: 'INR',
  status: 'captured',
  captured: true,
  amount_refunded: 0,
  order_id: 'order_Synthetic1',
  email: 'synthetic@example.test',
};
function fake(...replies: RazorpayHttpResponse[]) {
  const calls: RazorpayHttpRequest[] = [];
  const port = vi.fn((request: RazorpayHttpRequest) => {
    calls.push(request);
    const reply = replies.shift();
    return reply ? Promise.resolve(reply) : Promise.reject(new Error('no reply'));
  });
  return { calls, port, client: new RazorpayClient(keyId, keySecret, port) };
}
const ok = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body) });
const create = { amountMinor: 50000, currency: 'INR', receipt: 'rx_0193_1', notes: { a: 'b' } };

describe('RazorpayClient (fake port, no network)', () => {
  it('creates an order with Basic auth, integer minor units and receipt/notes', async () => {
    const { client, calls } = fake(ok(order));
    await expect(client.createOrder(create)).resolves.toMatchObject({
      id: 'order_Synthetic1',
      amount: 50000,
    });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/orders' });
    expect(calls[0]?.headers.Authorization).toBe(
      `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    );
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({
      amount: 50000,
      currency: 'INR',
      receipt: 'rx_0193_1',
      notes: { a: 'b' },
    });
  });
  it.each([
    { amountMinor: 99 },
    { amountMinor: 100.5 },
    { currency: 'inr' },
    { receipt: 'r'.repeat(41) },
    { notes: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${String(i)}`, 'v'])) },
    { notes: { k: 'v'.repeat(257) } },
  ])('refuses an invalid order request %j before any call', async (override) => {
    const { client, port } = fake();
    await expect(client.createOrder({ ...create, ...override })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(port).not.toHaveBeenCalled();
  });
  it('maps a duplicate receipt, transient and rejected statuses, and malformed bodies', async () => {
    const dup = ok(
      { error: { description: 'Duplicate request. This request has already been processed.' } },
      400,
    );
    await expect(fake(dup).client.createOrder(create)).rejects.toMatchObject({
      code: 'DUPLICATE_RECEIPT',
    });
    await expect(fake(ok({}, 503)).client.createOrder(create)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      transient: true,
    });
    await expect(fake(ok({}, 429)).client.createOrder(create)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(fake(ok({}, 401)).client.createOrder(create)).rejects.toMatchObject({
      code: 'REJECTED',
      transient: false,
    });
    await expect(fake(ok({}, 302)).client.createOrder(create)).rejects.toMatchObject({
      code: 'REJECTED',
    });
    await expect(
      fake({ status: 200, body: '{not json' }).client.createOrder(create),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE', transient: true });
    await expect(
      fake(ok({ ...order, amount: 1.5 })).client.createOrder(create),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
  it('never puts the key secret or a response body into an error message', async () => {
    const echo = ok({ error: { description: `bad key ${keySecret}` } }, 401);
    const error = await fake(echo)
      .client.createOrder(create)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RazorpayApiError);
    expect((error as Error).message).not.toContain(keySecret);
    expect(JSON.stringify(error)).not.toContain(keySecret);
    expect((error as Error).message).not.toContain(keyId);
  });
  it('finds orders by exact receipt only', async () => {
    const { client, calls } = fake(
      ok({
        entity: 'collection',
        count: 2,
        items: [order, { ...order, id: 'order_Other1', receipt: 'rx_other' }],
      }),
    );
    await expect(client.findOrdersByReceipt('rx_0193_1')).resolves.toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/orders?receipt=rx_0193_1' });
  });
  it('fetches a payment and keeps no customer data', async () => {
    const { client, calls } = fake(ok(payment));
    const result = await client.fetchPayment('pay_Synthetic1');
    expect(result).toMatchObject({
      status: 'captured',
      amount: 50000,
      order_id: 'order_Synthetic1',
    });
    expect(JSON.stringify(result)).not.toContain('example.test');
    expect(calls[0]?.path).toBe('/payments/pay_Synthetic1');
    await expect(client.fetchPayment('../orders')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });
  it('sends refunds with the X-Refund-Idempotency header and refuses short keys', async () => {
    const refund = {
      id: 'rfnd_Synthetic1',
      entity: 'refund',
      amount: 100,
      currency: 'INR',
      payment_id: 'pay_Synthetic1',
      status: 'pending',
    };
    const { client, calls } = fake(ok(refund));
    await expect(
      client.createRefund('pay_Synthetic1', {
        amountMinor: 100,
        idempotencyKey: 'refund-0193abcd',
      }),
    ).resolves.toMatchObject({ id: 'rfnd_Synthetic1', status: 'pending' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/payments/pay_Synthetic1/refund' });
    expect(calls[0]?.headers['X-Refund-Idempotency']).toBe('refund-0193abcd');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ amount: 100, speed: 'normal' });
    await expect(
      fake().client.createRefund('pay_Synthetic1', { idempotencyKey: 'short' }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
  it('lists the payments of an order and the settlement recon rows of one day', async () => {
    const { client, calls } = fake(
      ok({ entity: 'collection', count: 1, items: [payment] }),
      ok({
        entity: 'collection',
        count: 1,
        items: [
          {
            type: 'payment',
            amount: 50000,
            fee: 1000,
            tax: 180,
            payment_id: 'pay_Synthetic1',
            order_id: 'order_Synthetic1',
            settlement_id: 'setl_X',
          },
        ],
      }),
    );
    await expect(client.fetchOrderPayments('order_Synthetic1')).resolves.toHaveLength(1);
    await expect(
      client.fetchSettlementRecon({ year: 2026, month: 11, day: 19 }),
    ).resolves.toMatchObject([{ type: 'payment', amount: 50000, order_id: 'order_Synthetic1' }]);
    expect(calls.map((c) => c.path)).toEqual([
      '/orders/order_Synthetic1/payments',
      '/settlements/recon/combined?year=2026&month=11&day=19&count=1000',
    ]);
    await expect(client.fetchOrderPayments('../x')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(
      client.fetchSettlementRecon({ year: 2026, month: 13, day: 1 }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });
  it('refuses malformed credentials', () => {
    expect(() => new RazorpayClient('key', keySecret, vi.fn())).toThrow(RazorpayApiError);
    expect(() => new RazorpayClient(keyId, 'short', vi.fn())).toThrow(RazorpayApiError);
  });
});

describe('fetchRazorpayPort (fake fetch, no network)', () => {
  it('uses the fixed base URL, refuses redirects and bounds time', async () => {
    const fetchImpl = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    const port = fetchRazorpayPort(fetchImpl as unknown as typeof fetch, 8_000);
    await expect(port({ method: 'GET', path: '/payments/pay_X', headers: {} })).resolves.toEqual({
      status: 200,
      body: '{}',
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${RAZORPAY_API_BASE}/payments/pay_X`);
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it('maps transport failures and refuses path traversal', async () => {
    const port = fetchRazorpayPort(() => Promise.reject(new Error('ECONNRESET secret')));
    const error = await port({ method: 'GET', path: '/x', headers: {} }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TRANSPORT' });
    expect((error as Error).message).not.toContain('secret');
    await expect(port({ method: 'GET', path: '/../x', headers: {} })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(port({ method: 'GET', path: 'http://evil', headers: {} })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });
});
