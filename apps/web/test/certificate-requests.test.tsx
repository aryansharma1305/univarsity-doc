// @vitest-environment jsdom
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { submitCertificateRequestSchema } from '@docversity/validation';
import { ApiError } from '@/lib/api';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  can: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  catalogue: vi.fn(),
  action: vi.fn(),
  submit: vi.fn(),
}));
vi.mock('@/components/providers/session-context', () => ({ useCan: mocks.can }));
vi.mock('@/hooks/use-list-params', () => ({
  useListParams: () => ({
    values: { search: '', status: '', certificateType: '' },
    page: 1,
    update: vi.fn(),
  }),
}));
vi.mock('@/features/student-portal/student-motion', () => ({
  StudentActionMotion: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/certificate-requests/api', () => ({ certificateRequestsApi: mocks }));
// Phase 12C eligibility labels are covered in certificate-eligibility.test.tsx.
vi.mock('@/features/certificate-eligibility/student-panel', () => ({
  StudentCertificateEligibility: () => null,
}));
import {
  CertificateRequestsView,
  CertificateRequestDetailView,
} from '@/features/certificate-requests/views';
function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
const row = {
  id: 'test-request',
  reference: 'CR-SYNTHETIC',
  certificateType: 'TRANSCRIPT',
  status: 'INFORMATION_REQUESTED',
  version: 2,
  purpose: 'Further study',
  remarks: null,
  submittedAt: '2026-04-09T00:00:00.000Z',
  nextAction: 'Please provide information.',
  canRespond: true,
  canCancel: false,
  canReview: false,
  canCompleteReview: false,
  events: [
    {
      id: 'event',
      action: 'REQUEST_INFORMATION',
      studentMessage: 'Please clarify.',
      createdAt: '2026-04-09T00:00:00.000Z',
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
  mocks.list.mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    counts: { INFORMATION_REQUESTED: 0 },
  });
  mocks.catalogue.mockResolvedValue({
    data: [
      {
        certificateType: 'TRANSCRIPT',
        title: 'Transcript',
        description: 'Academic record',
        available: false,
        reason: 'Not available for applications yet.',
      },
    ],
    corrections: { reason: 'Corrections unavailable.' },
  });
  mocks.detail.mockResolvedValue(row);
  mocks.action.mockResolvedValue(row);
});
it('does not fetch or expose queues for unauthorized staff', () => {
  mocks.can.mockReturnValue(false);
  mount(<CertificateRequestsView />);
  expect(
    screen.getByRole('heading', { name: 'You don’t have access to this' }),
  ).toBeInTheDocument();
  expect(mocks.list).not.toHaveBeenCalled();
});
it('shows honest unavailable catalogue and empty personal history', async () => {
  mount(<CertificateRequestsView student />);
  expect(await screen.findByRole('button', { name: 'Not available yet' })).toBeDisabled();
  expect(await screen.findByText('No applications yet')).toBeVisible();
  expect(mocks.submit).not.toHaveBeenCalled();
});
it('shows a student-visible timeline and submits only the version and response', async () => {
  mount(<CertificateRequestDetailView id="test-request" student />);
  fireEvent.click(await screen.findByRole('button', { name: 'Provide information' }));
  fireEvent.change(screen.getByLabelText('Your response'), {
    target: { value: 'For higher study.' },
  });
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Provide information' }),
  );
  await waitFor(() => {
    expect(mocks.action).toHaveBeenCalledWith(true, 'test-request', 'respond', {
      version: 2,
      message: 'For higher study.',
    });
  });
  expect(screen.queryByText('Private staff note')).not.toBeInTheDocument();
});
it('does not display approval, issuance or policy-disabled review completion actions', async () => {
  mocks.detail.mockResolvedValue({
    ...row,
    canReview: true,
    status: 'UNDER_REVIEW',
    canRespond: false,
  });
  mount(<CertificateRequestDetailView id="test-request" />);
  expect(await screen.findByRole('button', { name: 'Request information' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Complete staff review' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Issue certificate' })).not.toBeInTheDocument();
});
it('keeps response errors visible and retains typed information for retry', async () => {
  mocks.action.mockRejectedValue(
    new ApiError(409, 'VALIDATION_FAILED', 'Conflict: refresh first.'),
  );
  mount(<CertificateRequestDetailView id="test-request" student />);
  fireEvent.click(await screen.findByRole('button', { name: 'Provide information' }));
  fireEvent.change(screen.getByLabelText('Your response'), {
    target: { value: 'Keep this response' },
  });
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Provide information' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Conflict: refresh first.');
  expect(screen.getByLabelText('Your response')).toHaveValue('Keep this response');
});

it('requires a summary before submitting an explicitly enabled synthetic service', async () => {
  mocks.catalogue.mockResolvedValue({
    data: [
      {
        certificateType: 'TRANSCRIPT',
        title: 'Transcript',
        description: 'Academic record',
        available: true,
        reason: 'Synthetic test policy',
        purposeRequired: true,
        remarksAllowed: true,
      },
    ],
    corrections: { reason: 'Corrections unavailable.' },
  });
  mocks.submit.mockResolvedValue(row);
  mount(<CertificateRequestsView student />);
  fireEvent.click(await screen.findByRole('button', { name: 'Request certificate' }));
  fireEvent.change(screen.getByLabelText('Purpose (required)'), {
    target: { value: 'Further study' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review application' }));
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
  await waitFor(() => {
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  const sent = submitCertificateRequestSchema.parse(mocks.submit.mock.calls[0]?.[0]);
  expect(sent.certificateType).toBe('TRANSCRIPT');
  expect(sent.purpose).toBe('Further study');
});
