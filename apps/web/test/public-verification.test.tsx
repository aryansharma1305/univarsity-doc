// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { OfficialVerificationResponse } from '@docversity/validation';
import type * as ApiModule from '@/lib/api';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async () => ({
  ...(await vi.importActual<typeof ApiModule>('@/lib/api')),
  studentRequest: request,
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,AAAA')) },
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
] as const;
const PROGRAM = '00000000-0000-4000-8000-0000000000aa';

afterEach(() => {
  // Clears any leftover handoff for every service (take always empties it).
  takeHeroSearch('registration');
  vi.restoreAllMocks();
  request.mockReset();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

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

it.each(services)(
  'submits %s without sign-in through the v2 contract',
  async (service, title, label, placeholder) => {
    request.mockResolvedValue(unavailable(service));
    render(<VerificationPanel service={service} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: label });
    expect(input).toHaveAttribute('placeholder', placeholder);
    fireEvent.click(screen.getByRole('button', { name: title }));
    expect(input).toBeInvalid();
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '0000-SYNTHETIC-REFERENCE' } });
    fireEvent.click(screen.getByRole('button', { name: title }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Verification not available'),
    );
    expect(request).toHaveBeenCalledWith('POST', `public/verify/${service}`, expect.anything(), {
      body: { contractVersion: 2, reference: '0000-SYNTHETIC-REFERENCE' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('No record was checked.');
    expect(screen.getByRole('status')).not.toHaveTextContent('0000-SYNTHETIC-REFERENCE');
    fireEvent.change(input, { target: { value: 'CHANGED-REFERENCE' } });
    expect(screen.getByRole('status')).toHaveTextContent('No record checked yet');
  },
);

it('shows a found registration in the mentor layout with only API-returned fields', async () => {
  const print = vi.fn();
  vi.stubGlobal('print', print);
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'registration',
    status: 'ACTIVE',
    recordStatus: 'ACTIVE',
    message: 'This student registration is valid and active.',
    maskedReference: '••••0001',
    details: {
      studentName: 'Synthetic Student',
      registrationNumber: '00000001',
      program: 'Synthetic Program',
      courseDuration: '1 year',
    },
    email: 'private@example.invalid',
  });
  render(<VerificationPanel service="registration" />);
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Registration' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Registration Found' })).toBeInTheDocument(),
  );
  const table = screen.getByRole('region', { name: 'Student Information' });
  expect(within(table).getByRole('rowheader', { name: 'Student Name' })).toBeInTheDocument();
  expect(within(table).getByText('Synthetic Student')).toBeInTheDocument();
  expect(within(table).getByText('00000001')).toBeInTheDocument();
  expect(within(table).queryByText('Admission Date')).not.toBeInTheDocument();
  expect(screen.queryByText('private@example.invalid')).not.toBeInTheDocument();
  expect(screen.queryByText(/DOB|Nationality|National ID/)).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'University crest' })).toBeInTheDocument();
  expect(screen.getByText('Status Options')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Print Registration Card/ }));
  expect(print).toHaveBeenCalledOnce();
});

it.each([
  ['COMPLETED', 'This registration is valid. The student has completed the course.'],
  ['SUSPENDED', 'This registration exists but is currently suspended.'],
])('never describes a %s registration as active', async (recordStatus, message) => {
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'registration',
    status: 'INACTIVE',
    recordStatus,
    message,
  });
  render(<VerificationPanel service="registration" />);
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Registration' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message));
  expect(screen.getByRole('status')).not.toHaveTextContent('valid and active');
});

it('shows a QR-checked certificate with a scannable code and the credential-gated View action', async () => {
  const token = 'a'.repeat(43);
  window.history.replaceState(null, '', `/verify/certificate#token=${token}`);
  const open = vi.fn(() => ({ location: { href: '' }, close: vi.fn() }));
  vi.stubGlobal('open', open);
  const fetch = vi.fn(() => Promise.resolve(new Response(new Blob(['%PDF']), { status: 200 })));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }),
  );
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'certificate',
    status: 'ISSUED',
    message: 'This officially issued document is valid.',
    institution: 'Synthetic University',
    maskedReference: '••••0123',
    documentType: 'TRANSCRIPT',
    details: {
      studentName: 'Synthetic Student',
      certificateType: 'TRANSCRIPT',
      issueDate: '2026-11-02',
    },
    documentAccess: true,
  });
  render(<VerificationPanel service="certificate" />);
  await waitFor(() => {
    expect(window.location.hash).toBe('');
  });
  expect(screen.getByRole('status')).toHaveTextContent('Secure QR code ready');
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Certificate Valid' })).toBeInTheDocument(),
  );
  expect(request).toHaveBeenCalledWith('POST', 'public/verify/certificate', expect.anything(), {
    body: { contractVersion: 2, token },
  });
  expect(
    screen.getByText('This certificate is genuine and issued by Synthetic University.'),
  ).toBeInTheDocument();
  expect(await screen.findByRole('img', { name: 'Verification QR code' })).toBeInTheDocument();
  expect(screen.getByText('••••0123')).toBeInTheDocument();
  const details = screen.getByRole('region', { name: 'Certificate Details' });
  expect(within(details).getByText('Transcript')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /View Certificate/ }));
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledOnce();
  });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/v1/public/verify/document');
  expect(url).not.toContain(token);
  expect(JSON.parse(init.body as string)).toEqual({
    contractVersion: 2,
    service: 'certificate',
    token,
  });
});

it('checks a certificate by number without a QR code or View action', async () => {
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'certificate',
    status: 'ISSUED',
    message: 'Valid.',
    institution: 'Synthetic University',
    maskedReference: '••••0123',
    documentAccess: false,
  });
  render(<VerificationPanel service="certificate" />);
  fireEvent.change(screen.getByLabelText('Certificate number'), { target: { value: 'SYN-0123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  await waitFor(() => expect(screen.getByText('Certificate Valid')).toBeInTheDocument());
  expect(screen.queryByRole('img', { name: 'Verification QR code' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /View Certificate/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Print Verification/ })).toBeInTheDocument();
  expect(screen.getByText(/The document itself stays private/)).toBeInTheDocument();
});

it('shows a revoked admission letter as revoked with no view action', async () => {
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'admission-letter',
    status: 'REVOKED',
    message: 'This document has been revoked or replaced.',
    documentAccess: true,
  });
  render(<VerificationPanel service="admission-letter" />);
  fireEvent.change(screen.getByLabelText('Admission letter number'), { target: { value: 'AL-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Admission Letter' }));
  await waitFor(() => expect(screen.getByText('Admission Letter Revoked')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /View/ })).not.toBeInTheDocument();
});

it.each(['NOT_FOUND', 'INVALID'])('shows no verified record for %s', async (status) => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('No verified record found'),
  );
  expect(screen.queryByText('Certificate Valid')).not.toBeInTheDocument();
});

it('reacts to later QR links and lets a typed number replace the credential', async () => {
  const first = 'a'.repeat(43),
    second = 'b'.repeat(43);
  window.history.replaceState(null, '', `/verify/certificate#token=${first}`);
  request.mockResolvedValue({
    contractVersion: 2,
    service: 'certificate',
    status: 'NOT_FOUND',
    message: 'x',
  });
  render(<VerificationPanel service="certificate" />);
  await waitFor(() => {
    expect(window.location.hash).toBe('');
  });
  expect(request).not.toHaveBeenCalled();
  window.history.replaceState(null, '', `/verify/certificate#token=${second}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
  await waitFor(() => {
    expect(window.location.hash).toBe('');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  await waitFor(() => {
    expect(request).toHaveBeenLastCalledWith(
      'POST',
      'public/verify/certificate',
      expect.anything(),
      {
        body: { contractVersion: 2, token: second },
      },
    );
  });
  fireEvent.change(screen.getByLabelText('Certificate number'), {
    target: { value: 'PRINTED-REFERENCE' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  await waitFor(() => {
    expect(request).toHaveBeenLastCalledWith(
      'POST',
      'public/verify/certificate',
      expect.anything(),
      {
        body: { contractVersion: 2, reference: 'PRINTED-REFERENCE' },
      },
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

it('never accepts a QR credential for registration', async () => {
  window.history.replaceState(null, '', `/verify/registration#token=${'a'.repeat(43)}`);
  render(<VerificationPanel service="registration" />);
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(window.location.hash).toBe('');
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
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  expect(screen.getByRole('textbox')).toBeDisabled();
  await act(async () => {
    finish?.({ contractVersion: 2, service: 'certificate', status: 'ISSUED', message: 'Issued.' });
    await pending;
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Certificate Valid')).toBeInTheDocument();
  request.mockRejectedValueOnce(new Error('PRIVATE SERVER ERROR'));
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Please try again shortly.'),
  );
  expect(screen.queryByText('Certificate Valid')).not.toBeInTheDocument();
  expect(screen.queryByText('PRIVATE SERVER ERROR')).not.toBeInTheDocument();
});

it('handles rate limits and offers student sign-in only when the API requires it', async () => {
  request.mockRejectedValueOnce(
    new ApiError(429, 'PUBLIC_VERIFICATION_RATE_LIMITED', 'private detail'),
  );
  render(<VerificationPanel service="registration" />);
  fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: '00000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Registration' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many checks'));
  expect(screen.queryByRole('link', { name: 'Student Sign in' })).not.toBeInTheDocument();
  request.mockResolvedValueOnce({
    contractVersion: 2,
    service: 'registration',
    status: 'AUTHENTICATION_REQUIRED',
    message: 'Sign in to your student account.',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Registration' }));
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Student Sign in' })).toHaveAttribute(
      'href',
      '/student/login',
    ),
  );
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
    expect(window.location.hash).toBe('');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  window.history.replaceState(null, '', `/verify/certificate#token=${second}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
  await act(async () => {
    finish?.({
      contractVersion: 2,
      service: 'certificate',
      status: 'ISSUED',
      message: 'Older issued document.',
    });
    await pending;
  });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Secure QR code ready'));
  expect(screen.queryByText('Certificate Valid')).not.toBeInTheDocument();
});

it('rejects malformed references locally with an accessible correction message', async () => {
  render(<VerificationPanel service="certificate" />);
  const input = screen.getByLabelText('Certificate number');
  fireEvent.change(input, { target: { value: 'ABC DEF' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent('Please check the entered code and try again.');
  expect(input).toHaveAttribute('aria-describedby', expect.stringContaining('-result'));
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
    fireEvent.click(screen.getByRole('button', { name: 'Verify Certificate' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe(message);
    expect(error).not.toHaveTextContent('PRIVATE-REFERENCE-DETAIL');
  },
);

/** Check Result: options load first, then the search; the mock routes by path. */
function resultApi(responses: Record<string, unknown>) {
  request.mockImplementation((_method: string, path: string) => {
    const value = responses[path];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });
}
const OPTIONS = {
  programs: [{ id: PROGRAM, name: 'Synthetic Diploma', structure: 'SEMESTER', periods: [1, 2] }],
};

it('Check Result asks for course, roll number and semester and shows a status without marks', async () => {
  resultApi({
    'public/verify/result-options': OPTIONS,
    'public/verify/result-search': {
      contractVersion: 2,
      service: 'result',
      status: 'VALID',
      message: 'An official published result exists for these details.',
      documentAccess: false,
      details: {
        program: 'Synthetic Diploma',
        rollNumber: '••••0042',
        period: { structure: 'SEMESTER', number: 1 },
        examination: 'Synthetic examination',
        outcome: 'PASS',
      },
    },
  });
  render(<VerificationPanel service="result" />);
  const course = await screen.findByLabelText('Course Name');
  await waitFor(() =>
    expect(within(course).getByRole('option', { name: 'Synthetic Diploma' })).toBeInTheDocument(),
  );
  expect(screen.getByLabelText('Semester')).toBeDisabled();
  fireEvent.change(course, { target: { value: PROGRAM } });
  expect(
    within(screen.getByLabelText('Semester'))
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['Select', 'Semester 1', 'Semester 2']);
  fireEvent.change(screen.getByLabelText('Roll Number'), { target: { value: 'ROLL-0042' } });
  fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check Result' }));
  await waitFor(() => expect(screen.getByText('Result Published')).toBeInTheDocument());
  expect(request).toHaveBeenCalledWith('POST', 'public/verify/result-search', expect.anything(), {
    body: { contractVersion: 2, programId: PROGRAM, rollNumber: 'ROLL-0042', periodNumber: 1 },
  });
  expect(screen.queryByRole('region', { name: /subject marks/ })).not.toBeInTheDocument();
  expect(
    screen.getByText(/Marks are never shown for a course, roll number and semester alone/),
  ).toBeInTheDocument();
});

it('Check Result announces malformed roll numbers without sending them', async () => {
  resultApi({ 'public/verify/result-options': OPTIONS });
  render(<VerificationPanel service="result" />);
  await screen.findByRole('option', { name: 'Synthetic Diploma' });
  fireEvent.change(screen.getByLabelText('Course Name'), { target: { value: PROGRAM } });
  fireEvent.change(screen.getByLabelText('Roll Number'), { target: { value: 'INVALID ROLL' } });
  fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check Result' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Enter a valid roll number');
  expect(alert).not.toHaveTextContent('INVALID ROLL');
  expect(request).toHaveBeenCalledTimes(1);
});

it('Check Result explains when no course offers online checks', async () => {
  resultApi({ 'public/verify/result-options': { programs: [] } });
  render(<VerificationPanel service="result" />);
  await waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'No course offers online result checks yet' }),
    ).toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Check Result' })).toBeDisabled();
});

it('a marksheet QR opens the full marksheet with totals and Print Marksheet', async () => {
  const token = 'm'.repeat(43);
  const print = vi.fn();
  vi.stubGlobal('print', print);
  window.history.replaceState(null, '', `/results#token=${token}`);
  resultApi({
    'public/verify/result-options': OPTIONS,
    'public/verify/result-marksheet': {
      contractVersion: 2,
      service: 'result',
      status: 'VALID',
      message: 'This marksheet matches an official published result.',
      documentAccess: true,
      details: { studentName: 'Synthetic Student', program: 'Synthetic Diploma', outcome: 'PASS' },
      results: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          usage: 'OFFICIAL',
          label: 'Official published result',
          examination: 'Synthetic examination',
          examinationId: '10000000-0000-4000-8000-000000000001',
          periodNumber: 1,
          attemptNumber: 1,
          publishedAt: '2026-11-15T00:00:00Z',
          sgpa: null,
          outcome: 'PASS',
          subjects: [
            {
              programSubjectId: '20000000-0000-4000-8000-000000000001',
              code: 'SYN101',
              name: 'Synthetic subject',
              internalMarks: null,
              externalMarks: null,
              practicalMarks: null,
              otherMarks: null,
              totalMarks: '85',
              maxMarks: '100',
              grade: 'A',
              status: 'PASS',
            },
          ],
        },
      ],
    },
  });
  render(<VerificationPanel service="result" />);
  await waitFor(() => {
    expect(window.location.hash).toBe('');
  });
  fireEvent.click(await screen.findByRole('button', { name: 'View marksheet' }));
  await waitFor(() => expect(screen.getByText('Marksheet Verified')).toBeInTheDocument());
  expect(request).toHaveBeenCalledWith(
    'POST',
    'public/verify/result-marksheet',
    expect.anything(),
    {
      body: { contractVersion: 2, token },
    },
  );
  const marks = screen.getByRole('region', { name: 'Synthetic examination subject marks' });
  expect(within(marks).getByText('SYN101')).toBeInTheDocument();
  expect(within(marks).getByText('85.00%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Print Marksheet/ }));
  expect(print).toHaveBeenCalledOnce();
});

it('signed-in students can still check their own results by registration number', async () => {
  resultApi({
    'public/verify/result-options': OPTIONS,
    'public/verify/result': unavailable('result'),
  });
  render(<VerificationPanel service="result" />);
  fireEvent.change(screen.getByLabelText('Your registration number'), {
    target: { value: '00000001' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show my results' }));
  await waitFor(() => {
    expect(request).toHaveBeenCalledWith('POST', 'public/verify/result', expect.anything(), {
      body: { contractVersion: 2, reference: '00000001' },
    });
  });
});

it('runs a homepage search exactly once under StrictMode and consumes the handoff', async () => {
  request.mockResolvedValue(unavailable('registration'));
  storeHeroSearch('registration', 'SYN-0001');
  const { unmount } = render(
    <StrictMode>
      <VerificationPanel service="registration" />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Verification not available'),
  );
  expect(screen.getByRole('textbox', { name: 'Registration number' })).toHaveValue('SYN-0001');
  unmount();
  render(<VerificationPanel service="registration" />);
  await settle();
  expect(request).toHaveBeenCalledTimes(1);
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
