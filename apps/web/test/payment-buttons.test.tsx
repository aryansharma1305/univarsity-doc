// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaymentButtonPanel, RazorpayTestEmbed } from '@/features/payments/payment-button';
import { FEE_SCHEDULE, formatFee, RAZORPAY_BUTTONS } from '@docversity/validation';
import { mockFetch } from './render';
const id = '01900000-0000-7000-8000-000000000001';
const view = {
  service: 'RE_EXAM',
  applicationId: id,
  paymentId: id,
  status: 'PENDING',
  unavailableReason: 'Collection disabled.',
  certificateFeeScope: 'HARD_COPY_ONLY',
  checkout: null,
  liveTransactionsEnabled: false,
  qrFallbackEnabled: false,
};
afterEach(() => vi.unstubAllGlobals());
it('shows pending state without loading checkout or changing payment status', async () => {
  mockFetch(() => ({ body: view }));
  render(<PaymentButtonPanel service="RE_EXAM" path={`re-exam/${id}`} />);
  await screen.findByText('Payment status: Pending');
  expect(screen.getByRole('heading', { name: 'Pay Re-Exam Fee' })).toBeInTheDocument();
  expect(document.querySelectorAll('script[src*=razorpay]')).toHaveLength(0);
  expect(screen.queryByRole('button')).toBeNull();
});
it('fails closed on response failure or forged live activation', async () => {
  mockFetch(() => ({ body: { ...view, liveTransactionsEnabled: true } }));
  render(<PaymentButtonPanel service="RE_EXAM" path={`re-exam/${id}`} />);
  await waitFor(() => {
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });
  expect(screen.getByText('Online payment not yet available')).toBeInTheDocument();
});
it('cleans provider-owned DOM across StrictMode, remount and button changes', () => {
  const checkout = { mode: 'TEST' as const, buttonId: 'pl_SyntheticTest' };
  const ui = render(
    <StrictMode>
      <RazorpayTestEmbed checkout={checkout} label="Pay Re-Exam Fee" />
    </StrictMode>,
  );
  expect(document.querySelectorAll('form script')).toHaveLength(1);
  ui.rerender(
    <StrictMode>
      <RazorpayTestEmbed
        checkout={{ ...checkout, buttonId: 'pl_OtherSynthetic' }}
        label="Pay Re-Exam Fee"
      />
    </StrictMode>,
  );
  const script = document.querySelector('form script');
  expect(script).toHaveAttribute('data-payment_button_id', 'pl_OtherSynthetic');
  expect(document.querySelectorAll('form script')).toHaveLength(1);
  if (!script) throw new Error('missing script');
  fireEvent.error(script);
  expect(screen.getByRole('alert')).toHaveTextContent('not been confirmed');
  ui.unmount();
  expect(document.querySelectorAll('form script')).toHaveLength(0);
});
it.each(Object.values(RAZORPAY_BUTTONS).map((button) => button.id))(
  'refuses unverified mentor checkout even if a caller bypasses validation: %s',
  (buttonId) => {
    render(<RazorpayTestEmbed checkout={{ mode: 'TEST', buttonId }} label="Pay" />);
    expect(document.querySelector('script')).toBeNull();
  },
);

it('shows the university fee schedule in en-IN rupees without making anything payable', async () => {
  expect(formatFee(FEE_SCHEDULE.CERTIFICATE_HARD_COPY.amountMinor)).toBe('₹3,500');
  expect(formatFee(FEE_SCHEDULE.RE_EXAM.amountMinor)).toBe('₹2,500');
  expect(formatFee(FEE_SCHEDULE.EXAM.amountMinor)).toBe('₹1,500');
  mockFetch(() => ({ body: { ...view, service: 'EXAM', status: 'UNAVAILABLE' } }));
  const exam = render(<PaymentButtonPanel service="EXAM" path={`exam/${id}/${id}`} />);
  expect(screen.getByText('Examination Fee:')).toHaveTextContent('Examination Fee: ₹1,500');
  exam.unmount();
  mockFetch(() => ({ body: { ...view, service: 'CERTIFICATE_HARD_COPY', status: 'UNAVAILABLE' } }));
  render(<PaymentButtonPanel service="CERTIFICATE_HARD_COPY" path={`certificate/${id}`} />);
  expect(screen.getByText('Certificate Fee:')).toHaveTextContent('Certificate Fee: ₹3,500');
  await screen.findByText('Online payment not yet available');
  expect(document.querySelectorAll('script')).toHaveLength(0);
});
