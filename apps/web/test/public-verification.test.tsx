// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PUBLIC_VERIFICATION_UNAVAILABLE } from '@docversity/validation';
import { VerificationPanel } from '@/features/public-verification/verification-panel';
afterEach(() => vi.unstubAllGlobals());
it('defaults to Result Checking and validates locally before any request', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<VerificationPanel />);
  expect(screen.getByRole('tab', { name: /Result Checking/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: 'Check service availability' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a reference');
  expect(fetcher).not.toHaveBeenCalled();
});
it('omits session credentials, clears reference and renders only a validated unavailable response', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        contractVersion: 1,
        service: 'result',
        status: 'UNAVAILABLE',
        message: PUBLIC_VERIFICATION_UNAVAILABLE,
      }),
  });
  vi.stubGlobal('fetch', fetcher);
  render(<VerificationPanel />);
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'SYNTHETIC-13A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check service availability' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('No record has been checked'),
  );
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
  });
  expect(screen.getByLabelText('Reference')).toHaveValue('');
});
it('rejects synthetic success and unsafe disclosure from an unexpected backend', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          contractVersion: 1,
          service: 'result',
          status: 'VERIFIED',
          message: 'PRIVATE SUCCESS',
          fullName: 'PRIVATE NAME',
        }),
    }),
  );
  render(<VerificationPanel />);
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'SYNTHETIC-13A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check service availability' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('No record has been checked'),
  );
  expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
});
