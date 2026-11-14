// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  studentRequest: request,
  ApiError: class extends Error {
    status = 429;
  },
}));
import { VerificationScreen } from '@/features/public-verification/verification-screen';
afterEach(() => {
  request.mockReset();
  window.history.replaceState(null, '', '/');
});
it('preserves leading zeros and shows only schema-approved fields returned by the client', async () => {
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'registration',
    status: 'ACTIVE',
    message: 'Verified.',
    maskedReference: '••••0001',
  });
  render(<VerificationScreen service="registration" />);
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify record' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ACTIVE'));
  expect(request).toHaveBeenCalledWith('POST', 'public/verify/registration', expect.anything(), {
    body: { contractVersion: 2, reference: '00000001' },
  });
  expect(screen.queryByText(/date of birth|photograph/i)).not.toBeInTheDocument();
});
it('reads QR credentials from the fragment and removes them from browser history', async () => {
  const token = 'a'.repeat(43);
  window.history.replaceState(null, '', `/verify/certificate#token=${token}`);
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'certificate',
    status: 'NOT_FOUND',
    message: 'No issued document found.',
  });
  render(<VerificationScreen service="certificate" />);
  await waitFor(() => {
    expect(screen.getByLabelText('Secure QR token (optional)')).toHaveValue(token);
  });
  expect(window.location.hash).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Verify record' }));
  await waitFor(() => {
    expect(request).toHaveBeenCalled();
  });
  expect(request.mock.calls[0]?.[3]).toEqual({ body: { contractVersion: 2, token } });
});
it('clears previous success on retry and provides unavailable and network error states', async () => {
  request
    .mockResolvedValueOnce({
      contractVersion: 2,
      service: 'certificate',
      status: 'UNAVAILABLE',
      message: 'Approval pending.',
    })
    .mockRejectedValueOnce(new Error('PRIVATE SERVER ERROR'));
  render(<VerificationScreen service="certificate" />);
  fireEvent.change(screen.getByLabelText('Certificate number'), { target: { value: 'TEST-100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify record' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Approval pending.'));
  fireEvent.click(screen.getByRole('button', { name: 'Verify record' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Please try again shortly.'),
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByText('PRIVATE SERVER ERROR')).not.toBeInTheDocument();
});
