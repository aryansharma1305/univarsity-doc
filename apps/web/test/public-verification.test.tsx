// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VerificationPanel } from '@/features/public-verification/verification-panel';

afterEach(() => vi.unstubAllGlobals());
const titles = [
  'Result Checking',
  'Registration Verification',
  'Certificate Verification',
  'Admission Letter Verification',
];
it('defaults to Result Checking with exactly the four unavailable services', () => {
  render(<VerificationPanel />);
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  for (const title of titles)
    expect(screen.getByRole('tab', { name: title })).toHaveTextContent('Not available yet');
  expect(screen.getByRole('tab', { name: 'Result Checking' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});
it('switches every service without collecting identifiers or making verification requests', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { container } = render(<VerificationPanel />);
  for (const title of titles) {
    fireEvent.mouseDown(screen.getByRole('tab', { name: title }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not available yet');
    expect(container.querySelectorAll('form,input,textarea,select')).toHaveLength(0);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it('never requests or renders an unexpected success payload while unavailable', () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ status: 'VERIFIED', fullName: 'PRIVATE SYNTHETIC NAME' }),
  });
  vi.stubGlobal('fetch', fetcher);
  render(<VerificationPanel />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Certificate Verification' }), {
    button: 0,
    ctrlKey: false,
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByText(/PRIVATE SYNTHETIC NAME|VERIFIED/)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Not available yet');
  expect(screen.getByText(/SAMPLE PDFs and course eligibility/)).toBeInTheDocument();
});
