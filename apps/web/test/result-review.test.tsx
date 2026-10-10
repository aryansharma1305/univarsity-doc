// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResultReviewDetailView } from '@/features/result-review/detail-view';
import { ResultReviewQueueView } from '@/features/result-review/queue-view';
import { VIEWER, mockFetch, renderWithProviders } from './render';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/results/review',
}));
afterEach(() => vi.unstubAllGlobals());
const id = '01900000-0000-7000-8000-000000000001';
const result = {
  id,
  version: 2,
  status: 'UNDER_REVIEW',
  registrationId: id,
  registrationNumber: 'SYNTHETIC-REVIEW',
  studentName: 'Synthetic Learner',
  examinationId: id,
  examinationName: 'Synthetic Examination',
  programId: id,
  curriculumId: id,
  academicSessionId: id,
  periodNumber: 1,
  structure: 'SEMESTER_WISE',
  attemptNumber: 1,
  revisionNumber: 1,
  subjects: [],
  issues: [],
  history: [],
  policy: {
    approvalEnabled: false,
    makerCheckerRequired: true,
    approvalBlockers: ['University review/approval role policy has not been authorized.'],
    publicationEnabled: false,
    publicationBlockers: ['Official publication policy is unresolved.'],
  },
};
it('does not fetch protected queues without results.read', () => {
  const fetch = mockFetch(() => ({ body: {} }));
  renderWithProviders(<ResultReviewQueueView />, VIEWER);
  expect(screen.getByText('You don’t have access to this')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it('clearly blocks publication and hides decisions for read-only staff', async () => {
  mockFetch(() => ({ body: result }));
  renderWithProviders(<ResultReviewDetailView id={id} />, {
    ...VIEWER,
    permissions: ['results.read'],
  });
  expect(await screen.findByText('Publication configuration required')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Approve reviewed version' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Publish/ })).not.toBeInTheDocument();
});
it('keeps approval unavailable while the server policy is unresolved', async () => {
  mockFetch(() => ({ body: result }));
  renderWithProviders(<ResultReviewDetailView id={id} />, {
    ...VIEWER,
    permissions: ['results.read', 'results.review', 'results.approve'],
  });
  expect(
    await screen.findByText('University review/approval role policy has not been authorized.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Approve reviewed version' }),
  ).not.toBeInTheDocument();
});
