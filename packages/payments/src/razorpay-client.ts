import { z } from 'zod';

/** Fixed, not configurable: a misconfigured base URL must never receive the key secret. */
export const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

export interface RazorpayHttpRequest {
  method: 'GET' | 'POST';
  /** Path below RAZORPAY_API_BASE, starting with "/". */
  path: string;
  headers: Record<string, string>;
  body?: string;
}
export interface RazorpayHttpResponse {
  status: number;
  body: string;
}
/** The only way the client reaches the network; tests inject a fake. */
export type RazorpayHttpPort = (request: RazorpayHttpRequest) => Promise<RazorpayHttpResponse>;

export type RazorpayApiErrorCode =
  | 'DUPLICATE_RECEIPT'
  | 'REJECTED'
  | 'UNAVAILABLE'
  | 'MALFORMED_RESPONSE'
  | 'TRANSPORT'
  | 'INVALID_REQUEST';
/** Messages never contain the key, the secret, a request body or a response body. */
export class RazorpayApiError extends Error {
  constructor(
    readonly code: RazorpayApiErrorCode,
    readonly status: number | null = null,
  ) {
    super(`Razorpay request failed: ${code}${status === null ? '' : ` (HTTP ${String(status)})`}`);
    this.name = 'RazorpayApiError';
  }
  /** Worth retrying later (our side or Razorpay's is temporarily unavailable). */
  get transient(): boolean {
    return this.code === 'UNAVAILABLE' || this.code === 'TRANSPORT';
  }
}

/** Production port: global fetch, fixed base URL, no redirects, bounded time. */
export function fetchRazorpayPort(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8_000,
): RazorpayHttpPort {
  return async ({ method, path, headers, body }) => {
    if (!path.startsWith('/') || path.includes('//') || path.includes('..'))
      throw new RazorpayApiError('INVALID_REQUEST');
    let response: Response;
    try {
      response = await fetchImpl(`${RAZORPAY_API_BASE}${path}`, {
        method,
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: response.status, body: await response.text() };
    } catch {
      throw new RazorpayApiError('TRANSPORT');
    }
  };
}

const amount = z.number().int().min(1).max(1_000_000_000);
const currency = z.string().regex(/^[A-Z]{3}$/);
const orderSchema = z.object({
  id: z.string().regex(/^order_[A-Za-z0-9]{1,50}$/),
  entity: z.literal('order'),
  amount,
  currency,
  receipt: z.string().max(40).nullable(),
  status: z.enum(['created', 'attempted', 'paid']),
});
const orderListSchema = z.object({ items: z.array(orderSchema).max(100) });
const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]{1,50}$/),
  entity: z.literal('payment'),
  amount,
  currency,
  status: z.enum(['created', 'authorized', 'captured', 'refunded', 'failed']),
  captured: z.boolean(),
  amount_refunded: z.number().int().min(0).max(1_000_000_000),
  order_id: z
    .string()
    .regex(/^order_[A-Za-z0-9]{1,50}$/)
    .nullable(),
});
const refundSchema = z.object({
  id: z.string().regex(/^rfnd_[A-Za-z0-9]{1,50}$/),
  entity: z.literal('refund'),
  amount,
  currency,
  payment_id: z.string().regex(/^pay_[A-Za-z0-9]{1,50}$/),
  status: z.enum(['pending', 'processed', 'failed']),
});
export type RazorpayOrder = z.infer<typeof orderSchema>;
export type RazorpayPayment = z.infer<typeof paymentSchema>;
export type RazorpayRefund = z.infer<typeof refundSchema>;

const notesSchema = z
  .record(z.string().min(1).max(40), z.string().max(256))
  .refine((notes) => Object.keys(notes).length <= 15, 'at most 15 notes');

export interface CreateOrderInput {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}
export interface CreateRefundInput {
  /** Omitted: full refund. */
  amountMinor?: number;
  /** Sent as X-Refund-Idempotency: 10+ characters of letters, digits, "-" or "_". */
  idempotencyKey: string;
  receipt?: string;
  notes?: Record<string, string>;
  speed?: 'normal' | 'optimum';
}

/** Orders, Payments and Refunds API client (server only). Never logs requests or responses. */
export class RazorpayClient {
  readonly #authorization: string;
  constructor(
    keyId: string,
    keySecret: string,
    private readonly port: RazorpayHttpPort,
  ) {
    if (!/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/.test(keyId) || keySecret.length < 16)
      throw new RazorpayApiError('INVALID_REQUEST');
    this.#authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  }

  createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
    const valid =
      Number.isInteger(input.amountMinor) &&
      input.amountMinor >= 100 &&
      input.amountMinor <= 1_000_000_000 &&
      currency.safeParse(input.currency).success &&
      /^[A-Za-z0-9_-]{1,40}$/.test(input.receipt) &&
      notesSchema.safeParse(input.notes).success;
    if (!valid) return Promise.reject(new RazorpayApiError('INVALID_REQUEST'));
    return this.call(orderSchema, 'POST', '/orders', {
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    });
  }

  async findOrdersByReceipt(receipt: string): Promise<RazorpayOrder[]> {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(receipt)) throw new RazorpayApiError('INVALID_REQUEST');
    const list = await this.call(
      orderListSchema,
      'GET',
      `/orders?receipt=${encodeURIComponent(receipt)}`,
    );
    return list.items.filter((order) => order.receipt === receipt);
  }

  fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    if (!/^pay_[A-Za-z0-9]{1,50}$/.test(paymentId))
      return Promise.reject(new RazorpayApiError('INVALID_REQUEST'));
    return this.call(paymentSchema, 'GET', `/payments/${paymentId}`);
  }

  createRefund(paymentId: string, input: CreateRefundInput): Promise<RazorpayRefund> {
    const valid =
      /^pay_[A-Za-z0-9]{1,50}$/.test(paymentId) &&
      /^[A-Za-z0-9_-]{10,64}$/.test(input.idempotencyKey) &&
      (input.amountMinor === undefined ||
        (Number.isInteger(input.amountMinor) &&
          input.amountMinor >= 1 &&
          input.amountMinor <= 1_000_000_000)) &&
      (input.receipt === undefined || /^[A-Za-z0-9_-]{1,40}$/.test(input.receipt)) &&
      (input.notes === undefined || notesSchema.safeParse(input.notes).success);
    if (!valid) return Promise.reject(new RazorpayApiError('INVALID_REQUEST'));
    return this.call(
      refundSchema,
      'POST',
      `/payments/${paymentId}/refund`,
      {
        ...(input.amountMinor === undefined ? {} : { amount: input.amountMinor }),
        speed: input.speed ?? 'normal',
        ...(input.receipt ? { receipt: input.receipt } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
      { 'X-Refund-Idempotency': input.idempotencyKey },
    );
  }

  private async call<T>(
    schema: z.ZodType<T>,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await this.port({
      method,
      path,
      headers: {
        Authorization: this.#authorization,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      json = undefined;
    }
    if (response.status >= 300 && response.status < 400)
      throw new RazorpayApiError('REJECTED', response.status);
    if (response.status === 429 || response.status >= 500)
      throw new RazorpayApiError('UNAVAILABLE', response.status);
    if (response.status >= 400) {
      const description = z
        .object({ error: z.object({ description: z.string().max(500) }) })
        .safeParse(json);
      const duplicate =
        response.status === 400 &&
        description.success &&
        /duplicate|already been processed/i.test(description.data.error.description);
      throw new RazorpayApiError(duplicate ? 'DUPLICATE_RECEIPT' : 'REJECTED', response.status);
    }
    const parsed = schema.safeParse(json);
    if (response.status < 200 || !parsed.success)
      throw new RazorpayApiError('MALFORMED_RESPONSE', response.status);
    return parsed.data;
  }
}
