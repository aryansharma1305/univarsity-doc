// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { OfficialVerificationResponse } from '@docversity/validation';
import type * as ApiModule from '@/lib/api';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async () => ({
  ...(await vi.importActual<typeof ApiModule>('@/lib/api')),
  studentRequest: request,
}));
import { ApiError } from '@/lib/api';
import { VerificationPanel } from '@/features/public-verification/verification-panel';
import { storeHeroSearch, takeHeroSearch } from '@/features/public-verification/search-handoff';

const services = [
  [
    'admission-letter',
    'Verify Admission Letter',
    'Admission letter number',
    'Enter admission letter number',
  ],
  [
    'certificate',
    'Verify Certificate',
    'Certificate number',
    'Enter the code printed on the certificate',
  ],
  ['registration', 'Verify Registration', 'Registration number', 'Enter registration number'],
  ['result', 'Check Result', 'Registration number', 'Enter your registration number'],
] as const;

afterEach(() => {
  // Clears any leftover handoff for every service (take always empties it).
  takeHeroSearch('registration');
  vi.restoreAllMocks();
  request.mockReset();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it.each(services)(
  'submits %s through the existing v2 contract while retaining the minimal form',
  async (service, title, label, placeholder) => {
    request.mockResolvedValue({
      contractVersion: 2,
      service,
      status: 'UNAVAILABLE',
      message:
        'The university has not enabled online verification for this service. No record was checked. Contact the university records office for help.',
    });
    render(<VerificationPanel service={service} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: label });
    expect(input).toHaveAttribute('placeholder', placeholder);
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(input).toBeInvalid();
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '0000-SYNTHETIC-REFERENCE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('UNAVAILABLE'));
    expect(request).toHaveBeenCalledWith('POST', `public/verify/${service}`, expect.anything(), {
      body: { contractVersion: 2, reference: '0000-SYNTHETIC-REFERENCE' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('No record was checked.');
    expect(screen.getByRole('status')).not.toHaveTextContent('0000-SYNTHETIC-REFERENCE');
    fireEvent.change(input, { target: { value: 'CHANGED-REFERENCE' } });
    expect(screen.getByRole('status')).toHaveTextContent('No record checked yet');
  },
);

it('displays only the approved result fields and preserves leading zeros', async () => {
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'registration',
    status: 'ACTIVE',
    message: 'Verified.',
    maskedReference: '••••0001',
    program: 'Synthetic Program',
    email: 'private@example.invalid',
  });
  render(<VerificationPanel service="registration" />);
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ACTIVE'));
  expect(request.mock.calls[0]?.[3]).toEqual({
    body: { contractVersion: 2, reference: '00000001' },
  });
  expect(screen.getByText('••••0001')).toBeInTheDocument();
  expect(screen.getByText('Synthetic Program')).toBeInTheDocument();
  expect(screen.queryByText('private@example.invalid')).not.toBeInTheDocument();
});

it.each(['NOT_FOUND', 'INVALID'])(
  'shows the requested recoverable message for %s',
  async (status) => {
    request.mockResolvedValue({
      contractVersion: 2,
      service: 'certificate',
      status,
      message: 'No approved match.',
    });
    render(<VerificationPanel service="certificate" />);
    fireEvent.change(screen.getByLabelText('Certificate number'), {
      target: { value: 'SYNTHETIC-100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'No matching record found. Please check the entered code and try again.',
      ),
    );
  },
);

it('uses one input for a secure QR fragment, clears history and reacts to later QR links', async () => {
  const first = 'a'.repeat(43),
    second = 'b'.repeat(43);
  window.history.replaceState(null, '', `/verify/certificate#token=${first}`);
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'certificate',
    status: 'NOT_FOUND',
    message: 'No issued match.',
  });
  render(<VerificationPanel service="certificate" />);
  await waitFor(() => expect(screen.getByLabelText('Certificate number')).toHaveValue(first));
  expect(window.location.hash).toBe('');
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => {
    expect(request).toHaveBeenCalledWith('POST', 'public/verify/certificate', expect.anything(), {
      body: { contractVersion: 2, token: first },
    });
  });
  window.history.replaceState(null, '', `/verify/certificate#token=${second}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
  await waitFor(() => expect(screen.getByLabelText('Certificate number')).toHaveValue(second));
  expect(window.location.hash).toBe('');
  fireEvent.change(screen.getByLabelText('Certificate number'), {
    target: { value: 'PRINTED-REFERENCE' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => {
    expect(request).toHaveBeenLastCalledWith(
      'POST',
      'public/verify/certificate',
      expect.anything(),
      { body: { contractVersion: 2, reference: 'PRINTED-REFERENCE' } },
    );
  });
});

it('clears invalid QR credentials without submitting them', async () => {
  window.history.replaceState(null, '', '/verify/certificate#token=invalid');
  render(<VerificationPanel service="certificate" />);
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the printed number instead'),
  );
  expect(window.location.hash).toBe('');
  expect(request).not.toHaveBeenCalled();
});

it('blocks duplicate pending requests and replaces prior results with a safe network error', async () => {
  let finish: ((value: OfficialVerificationResponse) => void) | undefined;
  const pending = new Promise<OfficialVerificationResponse>((resolve) => {
    finish = resolve;
  });
  request.mockReturnValueOnce(pending);
  render(<VerificationPanel service="certificate" />);
  fireEvent.change(screen.getByLabelText('Certificate number'), {
    target: { value: 'SYNTHETIC-100' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  expect(screen.getByRole('textbox')).toBeDisabled();
  await act(async () => {
    finish?.({ contractVersion: 2, service: 'certificate', status: 'ISSUED', message: 'Issued.' });
    await pending;
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('ISSUED');
  request.mockRejectedValueOnce(new Error('PRIVATE SERVER ERROR'));
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Please try again shortly.'),
  );
  expect(screen.queryByText('ISSUED')).not.toBeInTheDocument();
  expect(screen.queryByText('PRIVATE SERVER ERROR')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled();
});

it('handles rate limits and requests student authentication only when the API requires it', async () => {
  request.mockRejectedValueOnce(
    new ApiError(429, 'PUBLIC_VERIFICATION_RATE_LIMITED', 'private detail'),
  );
  render(<VerificationPanel service="registration" />);
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many checks'));
  request.mockResolvedValueOnce({
    contractVersion: 2,
    service: 'registration',
    status: 'AUTHENTICATION_REQUIRED',
    message: 'Sign in to your student account.',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Student Sign in' })).toHaveAttribute(
      'href',
      '/student/login',
    ),
  );
});

it('reveals private result filters only after a response and prints only matching published results', async () => {
  const print = vi.fn();
  vi.stubGlobal('print', print);
  const results = [1, 2].map((number) => ({
    id: `00000000-0000-4000-8000-00000000000${number}`,
    usage: 'OFFICIAL',
    label: 'Official published result',
    examination: `Synthetic examination ${number}`,
    examinationId: `10000000-0000-4000-8000-00000000000${number}`,
    periodNumber: number,
    attemptNumber: 1,
    publishedAt: '2026-11-15T00:00:00Z',
    sgpa: null,
    outcome: null,
    subjects: [],
  }));
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'result',
    status: 'VALID',
    message: 'Published results.',
    results,
  });
  render(<VerificationPanel service="result" />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => {
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
  // Each scrollable marks region has a distinct accessible name.
  for (const n of [1, 2])
    expect(
      screen.getByRole('region', {
        name: `Synthetic examination ${String(n)} subject marks, period ${String(n)}, attempt 1`,
      }),
    ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Semester / academic year'), { target: { value: '2' } });
  await waitFor(() => {
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
  expect(request).toHaveBeenLastCalledWith('POST', 'public/verify/result', expect.anything(), {
    body: { contractVersion: 2, reference: '00000001', periodNumber: 2 },
  });
  expect(screen.getByRole('article')).toHaveTextContent('Synthetic examination 2');
  fireEvent.change(screen.getByLabelText('Examination'), {
    target: { value: results[0]?.examinationId },
  });
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.getByText('No published results match these filters.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Print published results' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Examination'), {
    target: { value: results[1]?.examinationId },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Print published results' }));
  expect(print).toHaveBeenCalledOnce();
});

it('ignores an older response when a new QR link replaces a pending check', async () => {
  const first = 'a'.repeat(43),
    second = 'b'.repeat(43);
  let finish: ((value: OfficialVerificationResponse) => void) | undefined;
  const pending = new Promise<OfficialVerificationResponse>((resolve) => {
    finish = resolve;
  });
  request.mockReturnValueOnce(pending);
  window.history.replaceState(null, '', `/verify/certificate#token=${first}`);
  render(<VerificationPanel service="certificate" />);
  await waitFor(() => {
    expect(screen.getByLabelText('Certificate number')).toHaveValue(first);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  window.history.replaceState(null, '', `/verify/certificate#token=${second}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
  await waitFor(() => {
    expect(screen.getByLabelText('Certificate number')).toHaveValue(second);
  });
  await act(async () => {
    finish?.({
      contractVersion: 2,
      service: 'certificate',
      status: 'ISSUED',
      message: 'Older issued document.',
    });
    await pending;
  });
  expect(screen.getByRole('status')).toHaveTextContent('Secure QR code ready');
  expect(screen.queryByText('Older issued document.')).not.toBeInTheDocument();
  request.mockResolvedValueOnce({
    contractVersion: 2,
    service: 'certificate',
    status: 'REVOKED',
    message: 'New document revoked.',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('REVOKED');
  });
  expect(request).toHaveBeenLastCalledWith('POST', 'public/verify/certificate', expect.anything(), {
    body: { contractVersion: 2, token: second },
  });
});

it('keeps result filters usable when an authorized period lookup has no publications', async () => {
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'result',
    status: 'UNPUBLISHED',
    message: 'No published results.',
  });
  render(<VerificationPanel service="result" />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => {
    expect(screen.getByLabelText('Semester / academic year')).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'Print published results' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Semester / academic year'), { target: { value: '2' } });
  await waitFor(() => {
    expect(screen.getByLabelText('Semester / academic year')).toHaveValue('2');
  });
  expect(request).toHaveBeenLastCalledWith('POST', 'public/verify/result', expect.anything(), {
    body: { contractVersion: 2, reference: '00000001', periodNumber: 2 },
  });
  fireEvent.change(screen.getByLabelText('Semester / academic year'), { target: { value: '' } });
  await waitFor(() => {
    expect(screen.getByLabelText('Semester / academic year')).toHaveValue('');
  });
  expect(request).toHaveBeenLastCalledWith('POST', 'public/verify/result', expect.anything(), {
    body: { contractVersion: 2, reference: '00000001' },
  });
  expect(screen.getByLabelText('Examination')).toBeInTheDocument();
});

it('rejects malformed references locally with an accessible correction message', async () => {
  render(<VerificationPanel service="certificate" />);
  const input = screen.getByLabelText('Certificate number');
  fireEvent.change(input, { target: { value: 'ABC DEF' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent('Please check the entered code and try again.');
  expect(input).toHaveAttribute('aria-describedby', error.id);
  expect(error).not.toHaveTextContent('ABC DEF');
  expect(request).not.toHaveBeenCalled();
});

it.each([
  [400, 'VALIDATION_FAILED', 'Please check the entered code and try again.'],
  [429, 'PUBLIC_VERIFICATION_RATE_LIMITED', 'Too many checks. Wait a minute, then try again.'],
  [0, 'NETWORK_ERROR', 'Verification could not be completed. Please try again shortly.'],
  [500, 'INTERNAL_ERROR', 'Verification could not be completed. Please try again shortly.'],
  [403, 'FORBIDDEN', 'Verification could not be completed.'],
])(
  'announces safe guidance for HTTP %s without echoing API details',
  async (status, code, message) => {
    request.mockRejectedValueOnce(new ApiError(status, code, 'PRIVATE-REFERENCE-DETAIL'));
    render(<VerificationPanel service="certificate" />);
    fireEvent.change(screen.getByLabelText('Certificate number'), {
      target: { value: 'VALID-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe(message);
    expect(error).not.toHaveTextContent('PRIVATE-REFERENCE-DETAIL');
    expect(screen.getByLabelText('Certificate number')).toHaveAttribute(
      'aria-describedby',
      error.id,
    );
  },
);

const unavailable = (service: string) => ({
  contractVersion: 2,
  service,
  status: 'UNAVAILABLE',
  message:
    'The university has not enabled online verification for this service. No record was checked. Contact the university records office for help.',
});
const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

it('runs a homepage search exactly once under StrictMode and consumes the handoff', async () => {
  request.mockResolvedValue(unavailable('registration'));
  storeHeroSearch('registration', 'SYN-0001');
  const { unmount } = render(
    <StrictMode>
      <VerificationPanel service="registration" />
    </StrictMode>,
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('UNAVAILABLE'));
  expect(screen.getByRole('textbox', { name: 'Registration number' })).toHaveValue('SYN-0001');
  unmount();
  render(<VerificationPanel service="registration" />);
  await settle();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('POST', 'public/verify/registration', expect.anything(), {
    body: { contractVersion: 2, reference: 'SYN-0001' },
  });
  expect(takeHeroSearch('registration')).toBeNull();
});

it('does not run when the panel unmounts before the handoff is read', async () => {
  storeHeroSearch('registration', 'SYN-0001');
  const { unmount } = render(<VerificationPanel service="registration" />);
  unmount();
  await settle();
  expect(request).not.toHaveBeenCalled();
});

it.each([
  [
    'another service',
    () => {
      storeHeroSearch('certificate', 'SYN-0001');
    },
  ],
  [
    'a stale handoff',
    () => {
      storeHeroSearch('registration', 'SYN-0001');
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    },
  ],
  ['no handoff (a header link or a typed URL)', () => undefined],
])('ignores %s', async (_name, arrange) => {
  arrange();
  render(<VerificationPanel service="registration" />);
  await settle();
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Registration number' })).toHaveValue('');
});

it('prefills a too-short number without sending it', async () => {
  storeHeroSearch('registration', 'AB');
  render(<VerificationPanel service="registration" />);
  await settle();
  expect(screen.getByRole('textbox', { name: 'Registration number' })).toHaveValue('AB');
  expect(request).not.toHaveBeenCalled();
});
