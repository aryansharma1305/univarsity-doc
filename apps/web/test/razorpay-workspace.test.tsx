// @vitest-environment jsdom
// SIMULATED data only: the staff Razorpay TEST workspace with mocked API responses.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { AuthUser } from '@docversity/validation';
import { RazorpayWorkspacePanel } from '@/features/re-exam-payments/razorpay-workspace';
import { VIEWER, mockFetch, renderWithProviders } from './render';

const paymentId = '01900000-0000-7000-8000-0000000000c1';
const refundId = '01900000-0000-7000-8000-0000000000f1';
const READER: AuthUser = { ...VIEWER, permissions: [...VIEWER.permissions, 'reExamPayments.read'] };
const VERIFIER: AuthUser = {
  ...READER,
  permissions: [...READER.permissions, 'reExamPayments.verify', 'reExamPayments.refundApprove'],
};
const REQUESTER: AuthUser = {
  ...READER,
  permissions: [...READER.permissions, 'reExamPayments.verify'],
};
const workspace = {
  mode: 'TEST',
  refunds: 'partial',
  orders: [
    {
      id: '01900000-0000-7000-8000-0000000000e1',
      attempt: 1,
      status: 'PAID',
      paymentState: 'PAID',
      refundState: 'REFUND_PENDING',
      refundableMinor: 70_000,
      providerOrderId: 'order_SyntheticWs1',
      providerPaymentId: 'pay_SyntheticWs1',
      amountMinor: 100_000,
      currency: 'INR',
      createdAt: '2026-11-20T10:00:00.000Z',
      events: [
        { kind: 'RESERVED', reason: null, createdAt: '2026-11-20T10:00:00.000Z' },
        { kind: 'PAID', reason: null, createdAt: '2026-11-20T10:05:00.000Z' },
      ],
    },
  ],
  refundRequests: [
    {
      id: refundId,
      amountMinor: 30_000,
      currency: 'INR',
      reason: 'DUPLICATE_PAYMENT',
      status: 'REQUESTED',
      source: 'STAFF',
      providerPaymentId: 'pay_SyntheticWs1',
      providerRefundId: null,
      failureReason: null,
      requestedBy: { id: '01900000-0000-7000-8000-0000000000d1', name: 'Synthetic Maker' },
      approvedBy: null,
      createdAt: '2026-11-20T11:00:00.000Z',
      decidedAt: null,
      events: [{ kind: 'REQUESTED', createdAt: '2026-11-20T11:00:00.000Z' }],
    },
  ],
  refundCandidates: [
    {
      orderId: '01900000-0000-7000-8000-0000000000e2',
      providerPaymentId: 'pay_LateCapture1',
      reason: 'ORDER_NOT_OPEN',
      amountMinor: 100_000,
      currency: 'INR',
      refundableMinor: 100_000,
    },
  ],
  audit: [
    {
      action: 'RAZORPAY_REFUND_REQUESTED',
      actor: 'Synthetic Maker',
      createdAt: '2026-11-20T11:00:00.000Z',
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());

it('shows orders, derived states, refunds and the audit trail, and lets a verifier decide', async () => {
  const fetchMock = mockFetch((method, path) => {
    if (method === 'GET') return { body: workspace };
    return { body: { id: refundId, status: path.endsWith('/approve') ? 'PENDING' : 'REJECTED' } };
  });
  renderWithProviders(<RazorpayWorkspacePanel paymentId={paymentId} />, VERIFIER);
  expect(await screen.findByRole('heading', { name: 'Razorpay (TEST mode)' })).toBeInTheDocument();
  expect(screen.getByText(/Paid \(captured, amount exact\)/)).toBeInTheDocument();
  expect(screen.getByText(/refund pending/)).toBeInTheDocument();
  expect(screen.getByText(/Requested by Synthetic Maker/)).toBeInTheDocument();
  expect(screen.getByText(/Audit trail \(1\)/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Refund amount/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Approve and send refund' }));
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes(
            `/refunds/${refundId}/approve`,
          ) && init?.method === 'POST',
      ),
    ).toBe(true);
  });
});

it('lets a requester request but not approve, and lists refund candidates', async () => {
  mockFetch(() => ({ body: workspace }));
  renderWithProviders(<RazorpayWorkspacePanel paymentId={paymentId} />, REQUESTER);
  await screen.findByRole('heading', { name: 'Razorpay (TEST mode)' });
  expect(screen.queryByRole('button', { name: 'Approve and send refund' })).toBeNull();
  expect(screen.getByText(/Captures to return/)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Request refund/ }).length).toBeGreaterThan(0);
});

it('offers lookup-first resolution for a refused send to refund approvers', async () => {
  const fetchMock = mockFetch((method) =>
    method === 'GET'
      ? {
          body: {
            ...workspace,
            refundRequests: [
              { ...workspace.refundRequests[0], status: 'SENDING', failureReason: 'REJECTED' },
            ],
          },
        }
      : { body: { id: refundId, status: 'FAILED' } },
  );
  renderWithProviders(<RazorpayWorkspacePanel paymentId={paymentId} />, VERIFIER);
  await userEvent.click(await screen.findByRole('button', { name: 'Look up and mark failed' }));
  expect(screen.getByRole('button', { name: 'Look up and retry' })).toBeInTheDocument();
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(
        ([, init]) =>
          init?.method === 'POST' && init.body === JSON.stringify({ action: 'MARK_FAILED' }),
      ),
    ).toBe(true);
  });
});

it('offers no refund actions without the verify permission', async () => {
  mockFetch(() => ({ body: workspace }));
  renderWithProviders(<RazorpayWorkspacePanel paymentId={paymentId} />, READER);
  await screen.findByRole('heading', { name: 'Razorpay (TEST mode)' });
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByLabelText(/Reason code/)).toBeNull();
});

it('renders nothing when Razorpay is off (404)', async () => {
  const fetchMock = mockFetch(() => ({
    status: 404,
    body: { error: { code: 'NOT_FOUND', message: 'Not found.' } },
  }));
  const view = renderWithProviders(<RazorpayWorkspacePanel paymentId={paymentId} />, VERIFIER);
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled();
  });
  expect(view.container).toBeEmptyDOMElement();
});
