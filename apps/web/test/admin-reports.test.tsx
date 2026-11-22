// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { ReportsView } from '@/features/reports/reports-view';
import { resetApiClient } from '@/lib/api';
import { EMPTY_PAGE, mockFetch, renderWithProviders, VIEWER } from './render';

const urls = (fetch: ReturnType<typeof mockFetch>) =>
  fetch.mock.calls.map(([input]) => (typeof input === 'string' ? input : ''));

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/reports',
  useSearchParams: () => search,
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

beforeEach(() => {
  resetApiClient();
  search = new URLSearchParams();
  replace.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const REPORT = {
  report: 'enrolment',
  columns: [
    { key: 'courseCode', label: 'Course code' },
    { key: 'sessionCode', label: 'Academic session' },
    { key: 'status', label: 'Registration status' },
    { key: 'registrations', label: 'Registrations' },
  ],
  rows: [
    { courseCode: 'BSC', sessionCode: '2026', status: 'ACTIVE', registrations: 40 },
    { courseCode: 'BSC', sessionCode: '2026', status: 'COMPLETED', registrations: 2 },
  ],
  total: 42,
  generatedAt: '2026-11-22T10:00:00.000Z',
};

describe('reports', () => {
  it('shows an empty state when the account may read no report, without calling the API', () => {
    const fetch = mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<ReportsView />, { ...VIEWER, permissions: [] });
    expect(screen.getByText('No reports available')).toBeVisible();
    expect(urls(fetch).some((url) => url.includes('reports/'))).toBe(false);
  });

  it('lists only permitted reports and renders real rows with the total', async () => {
    const fetch = mockFetch((_method, path) => ({
      body: path === 'reports/enrolment' ? REPORT : EMPTY_PAGE,
    }));
    renderWithProviders(<ReportsView />, {
      ...VIEWER,
      permissions: ['registrations.read', 'academicSessions.read', 'programs.read'],
    });
    const table = await screen.findByRole('table', { name: 'Enrolment report' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('42')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Report' })).toHaveTextContent('Enrolment');
    expect(screen.getByRole('combobox', { name: 'Registration status' })).toBeVisible();
    // Date filters belong to other reports.
    expect(screen.queryByLabelText('From (UTC)')).not.toBeInTheDocument();
    expect(urls(fetch).some((url) => url.includes('reports/results'))).toBe(false);
  });

  it('sends only the filters the selected report accepts', async () => {
    search = new URLSearchParams('report=student-messages&from=2026-11-01&programId=x');
    const fetch = mockFetch(() => ({
      body: { ...REPORT, report: 'student-messages', rows: [], total: 0 },
    }));
    renderWithProviders(<ReportsView />, {
      ...VIEWER,
      permissions: ['registrations.read', 'studentMessages.read'],
    });
    expect(await screen.findByText('No records')).toBeVisible();
    const call = urls(fetch).find((url) => url.includes('reports/'));
    expect(call).toContain('reports/student-messages?from=2026-11-01');
    expect(call).not.toContain('programId');
    expect(screen.getByLabelText('From (UTC)')).toHaveValue('2026-11-01');
  });
});
