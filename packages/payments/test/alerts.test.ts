import { describe, expect, it, vi } from 'vitest';
import { alertNotifier, type PaymentAlert } from '../src/server/core.js';

const alert: PaymentAlert = {
  kind: 'REFUND_FAILED',
  severity: 'critical',
  details: { refundId: 'r1' },
};

describe('pluggable payment alert notifier (no network: fake fetch)', () => {
  it('logs only when no webhook URL is configured', async () => {
    const fallback = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn();
    await alertNotifier(undefined, fallback, fetchImpl)(alert);
    expect(fallback).toHaveBeenCalledWith(alert);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('POSTs ids and codes as JSON, and falls back to the log on failure', async () => {
    const fallback = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(new Response('', { status: 200 })),
    );
    const notify = alertNotifier(
      'https://ntfy.example.invalid/topic',
      fallback,
      fetchImpl as unknown as typeof fetch,
    );
    await notify(alert);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://ntfy.example.invalid/topic');
    expect(init?.redirect).toBe('error');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')).toMatchObject({
      kind: 'REFUND_FAILED',
      details: { refundId: 'r1' },
    });
    expect(fallback).not.toHaveBeenCalled();
    fetchImpl.mockImplementationOnce(() => Promise.reject(new Error('down')));
    await expect(notify(alert)).resolves.toBeUndefined();
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
