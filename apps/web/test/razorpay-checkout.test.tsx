// @vitest-environment jsdom
// SIMULATED: a fake window.Razorpay stands in for Standard Checkout; no provider script or network.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaymentButtonPanel } from '@/features/payments/payment-button';
import { RAZORPAY_CHECKOUT_SRC } from '@/features/payments/razorpay-checkout';
import { resetApiClient } from '@/lib/api';
import { enforcedCsp } from '@/lib/csp';
import { mockFetch } from './render';

const appId = '01900000-0000-7000-8000-000000000001';
const paymentId = '01900000-0000-7000-8000-000000000002';
const panel = {
  service: 'RE_EXAM',
  applicationId: appId,
  paymentId,
  status: 'PENDING',
  unavailableReason: null,
  certificateFeeScope: 'HARD_COPY_ONLY',
  checkout: { mode: 'TEST', kind: 'ORDER' },
  liveTransactionsEnabled: false,
  qrFallbackEnabled: false,
};
const order = {
  orderId: 'order_SyntheticUi1',
  keyId: 'rzp_test_SYNTHETIC',
  amountMinor: 100000,
  currency: 'INR',
  mode: 'TEST',
};
interface Options {
  key: string;
  order_id: string;
  amount: number;
  handler: (r: Record<string, string>) => void;
  modal: { ondismiss: () => void };
  prefill?: unknown;
}
let instances: { options: Options; failed?: () => void; opened: number }[] = [];
class FakeCheckout {
  record: { options: Options; failed?: () => void; opened: number };
  constructor(options: Options) {
    this.record = { options, opened: 0 };
    instances.push(this.record);
  }
  open() {
    this.record.opened++;
  }
  on(_event: string, handler: () => void) {
    this.record.failed = handler;
  }
}
interface Reply {
  status?: number;
  body: unknown;
}
function server(overrides: { order?: Reply; history?: Reply } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = mockFetch((method, path, body) => {
    calls.push({ method, path, body });
    if (path === 'student-auth/csrf') return { body: { csrfToken: 'student-token' } };
    if (path === `student/payment-buttons/re-exam/${appId}`) return { body: panel };
    if (path === `student/re-exam-payments/${paymentId}/razorpay`)
      return overrides.history ?? { body: { orders: [] } };
    if (path === `student/re-exam-payments/${paymentId}/razorpay-order`)
      return overrides.order ?? { body: order };
    if (path === `student/re-exam-payments/${paymentId}/razorpay-return`)
      return { body: { status: 'AWAITING_CONFIRMATION' } };
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found.' } } };
  });
  return { calls, fetchMock };
}
const orderPosts = (calls: { method: string; path: string; body: unknown }[]) =>
  calls.filter((c) => c.method === 'POST' && c.path.endsWith('/razorpay-order'));

beforeEach(() => {
  instances = [];
  resetApiClient();
  window.Razorpay = FakeCheckout as unknown as NonNullable<typeof window.Razorpay>;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.Razorpay;
  document.querySelectorAll('script').forEach((s) => {
    s.remove();
  });
});

async function openPanel() {
  render(<PaymentButtonPanel service="RE_EXAM" path={`re-exam/${appId}`} />);
  return screen.findByRole('button', { name: 'Pay online (TEST)' });
}

it('creates the order on the server, opens checkout with the public key only and guards double clicks', async () => {
  const { calls } = server();
  const button = await openPanel();
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => {
    expect(instances).toHaveLength(1);
  });
  expect(orderPosts(calls)).toHaveLength(1);
  expect(orderPosts(calls)[0]?.body).toBeUndefined(); // the browser never sends an amount
  const { options } = instances[0] ?? { options: null };
  expect(options).toMatchObject({
    key: 'rzp_test_SYNTHETIC',
    order_id: 'order_SyntheticUi1',
    amount: 100000,
  });
  expect(options?.prefill).toBeUndefined();
  expect(JSON.stringify(options)).not.toMatch(/secret/i);
  expect(instances[0]?.opened).toBe(1);
  expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
});

it('posts the checkout response and then waits for the webhook instead of claiming payment', async () => {
  const { calls } = server();
  fireEvent.click(await openPanel());
  await waitFor(() => {
    expect(instances).toHaveLength(1);
  });
  const response = {
    razorpay_order_id: 'order_SyntheticUi1',
    razorpay_payment_id: 'pay_SyntheticUi1',
    razorpay_signature: 'a'.repeat(64),
  };
  act(() => {
    instances[0]?.options.handler(response);
  });
  expect(await screen.findByText(/Waiting for confirmation from Razorpay/)).toBeInTheDocument();
  expect(calls.find((c) => c.path.endsWith('/razorpay-return'))?.body).toEqual(response);
  expect(screen.queryByText(/Paid/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pay online (TEST)' })).toBeNull();
});

it.each([
  [
    'cancel',
    (r: (typeof instances)[number]) => {
      r.options.modal.ondismiss();
    },
    /Checkout was closed/,
  ],
  [
    'failure',
    (r: (typeof instances)[number]) => {
      r.failed?.();
    },
    /did not go through/,
  ],
])('handles %s and allows a retry', async (_name, trigger, message) => {
  server();
  fireEvent.click(await openPanel());
  await waitFor(() => {
    expect(instances).toHaveLength(1);
  });
  act(() => {
    const record = instances[0];
    if (record) trigger(record);
  });
  expect(await screen.findByText(message)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pay online (TEST)' }));
  await waitFor(() => {
    expect(instances).toHaveLength(2);
  });
});

it('reports network and availability failures without opening checkout', async () => {
  server({
    order: { status: 503, body: { error: { code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'x' } } },
  });
  fireEvent.click(await openPanel());
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the payment service/);
  expect(instances).toHaveLength(0);
});

it('reports an unpayable obligation (409) as unavailable', async () => {
  server({ order: { status: 409, body: { error: { code: 'CONFLICT', message: 'x' } } } });
  fireEvent.click(await openPanel());
  expect(await screen.findByRole('alert')).toHaveTextContent(/not available/);
});

it('reports a checkout script that cannot load', async () => {
  delete window.Razorpay;
  server();
  fireEvent.click(await openPanel());
  const script = await waitFor(() => {
    const found = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
    if (!found) throw new Error('script not requested yet');
    return found;
  });
  fireEvent.error(script);
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the payment service/);
});

it('shows an acknowledgement (not an official receipt) and the attempt history once paid', async () => {
  server({
    history: {
      body: {
        orders: [
          {
            attempt: 1,
            paymentState: 'ABANDONED',
            providerOrderId: 'order_Old',
            providerPaymentId: null,
            amountMinor: 100000,
            currency: 'INR',
            createdAt: '2026-11-20T10:00:00.000Z',
            checkoutReturnedAt: null,
          },
          {
            attempt: 2,
            paymentState: 'PAID',
            providerOrderId: 'order_SyntheticUi1',
            providerPaymentId: 'pay_SyntheticUi1',
            amountMinor: 100000,
            currency: 'INR',
            createdAt: '2026-11-20T11:00:00.000Z',
            checkoutReturnedAt: '2026-11-20T11:01:00.000Z',
          },
        ],
      },
    },
  });
  render(<PaymentButtonPanel service="RE_EXAM" path={`re-exam/${appId}`} />);
  const note = await screen.findByRole('note');
  expect(note).toHaveTextContent('Acknowledgement (not an official receipt)');
  expect(note).toHaveTextContent('pay_SyntheticUi1');
  expect(screen.queryByRole('button', { name: 'Pay online (TEST)' })).toBeNull();
  expect(screen.getByText(/Attempt 1: Closed \(not paid\)/)).toBeInTheDocument();
});

it('loads only the exact Razorpay checkout host that the enforced CSP already allows', () => {
  const script = enforcedCsp(false)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('script-src '));
  expect(new URL(RAZORPAY_CHECKOUT_SRC).origin).toBe('https://checkout.razorpay.com');
  expect(script?.split(' ')).toContain('https://checkout.razorpay.com');
  expect(script).not.toContain('*');
});
