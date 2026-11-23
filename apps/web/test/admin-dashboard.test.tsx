// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminShell } from '@/components/admin/admin-shell';
import { ADMIN_NAV, NAV_GROUPS, visibleAdminNav } from '@/components/admin/nav';
import { activeNavHref } from '@/components/admin/nav-groups';
import { DashboardView } from '@/features/dashboard/dashboard-view';
import { resetApiClient } from '@/lib/api';
import { mockFetch, renderWithProviders, VIEWER } from './render';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/results/import',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  resetApiClient();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const NO_WORKLOAD = {
  profileRequestsPending: null,
  certificateRequestsAwaitingStaff: null,
  reExamApplicationsPending: null,
  reExamPaymentsPending: null,
  resultsDraft: null,
  resultsUnderReview: null,
  resultsPublished: null,
  resultsWithheld: null,
  documentsAwaitingApproval: null,
  documentsIssued: null,
  admissionLettersIssued: null,
  messagesAwaitingReply: null,
  verificationQueriesOpen: null,
  unreadNotifications: 0,
};

/** A dashboard response: queues the account may not read are null, as the API returns them. */
function dashboard(
  overrides: {
    recentActivity?: unknown[] | null;
    workload?: Partial<Record<keyof typeof NO_WORKLOAD, number | null>>;
    enrolment?: unknown;
  } = {},
) {
  return {
    counts: { students: 123, activeRegistrations: 99, programs: 4, academicSessions: 2 },
    recentActivity: overrides.recentActivity ?? null,
    workload: { ...NO_WORKLOAD, ...overrides.workload },
    enrolment: overrides.enrolment ?? null,
  };
}

describe('UI-02 navigation and dashboard', () => {
  it('selects the most specific route or matching workspace filter', () => {
    expect(activeNavHref('/admin/results/import/preview', ADMIN_NAV)).toBe('/admin/results/import');
    expect(activeNavHref('/admin/results/new', ADMIN_NAV)).toBe('/admin/results/new');
    expect(activeNavHref('/admin/official-records', ADMIN_NAV)).toBe('/admin/official-records');
    expect(
      activeNavHref(
        '/admin/official-records',
        ADMIN_NAV,
        new URLSearchParams('service=certificate&page=2&tab=policies'),
      ),
    ).toBe('/admin/official-records?tab=policies&service=certificate');
    expect(activeNavHref('/admin/future-workspace', ADMIN_NAV)).toBeUndefined();
  });

  it('keeps the requested workspace groups ordered and gates write shortcuts', () => {
    expect(NAV_GROUPS).toEqual([
      'Workspace Navigation',
      'Admission',
      'Requests',
      'Certificates',
      'Results',
      'Examination',
      'Course Management',
      'Subject Management',
      'Schools & Departments',
      'Imports & Reports',
      'Academic Session',
      'Chat & Communication',
      'Settings & Administration',
    ]);
    expect(visibleAdminNav(['students.write']).some((item) => item.label === 'New Admission')).toBe(
      false,
    );
    expect(
      visibleAdminNav(['students.write', 'registrations.write']).some(
        (item) => item.label === 'New Admission',
      ),
    ).toBe(true);
    expect(
      visibleAdminNav(VIEWER.permissions).some((item) => item.label === 'Staff Users & Roles'),
    ).toBe(false);
  });

  it('filters navigation by the existing permissions and persists sidebar collapse', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AdminShell user={VIEWER}>
        <p>Record content</p>
      </AdminShell>,
      VIEWER,
    );
    // Hidden (collapsed) links count too: permission filtering must remove them, not hide them.
    expect(screen.queryByRole('link', { name: 'Payment Settings', hidden: true })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Draft Results', hidden: true })).toBeNull();
    // Groups are an accordion: opening one closes the other.
    const admission = screen.getByRole('button', { name: 'Admission' });
    const courses = screen.getByRole('button', { name: 'Course Management' });
    expect(admission).toHaveAttribute('aria-expanded', 'false');
    await user.click(admission);
    expect(admission).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /^Students$/ })).toBeVisible();
    await user.click(courses);
    expect(courses).toHaveAttribute('aria-expanded', 'true');
    expect(admission).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /^Students$/ })).toBeNull();
    await user.click(admission);
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(localStorage.getItem('docversity.admin.sidebarCollapsed')).toBe('1');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: /^Students$/ })).toHaveAccessibleName('Students');
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(localStorage.getItem('docversity.admin.sidebarCollapsed')).toBe('0');
  });

  it('renders API totals and hides queues the account may not read', async () => {
    const fetch = mockFetch(() => ({ body: dashboard() }));
    renderWithProviders(<DashboardView />, VIEWER);
    expect(await screen.findByText('123')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Pending work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Records' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tab', { name: 'Examination' })).not.toBeInTheDocument();
  });

  it('shows only the authorized queues with their real totals', async () => {
    mockFetch(() => ({
      body: dashboard({
        recentActivity: [],
        workload: { profileRequestsPending: 7, messagesAwaitingReply: 0 },
      }),
    }));
    renderWithProviders(<DashboardView />, {
      ...VIEWER,
      permissions: [...VIEWER.permissions, 'studentProfileRequests.review'],
    });
    expect(await screen.findByLabelText('7 pending profile requests')).toBeVisible();
    // Readable but not actionable for this account (no studentMessages.respond): not its work.
    expect(screen.queryByLabelText('0 pending student messages')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment submissions')).not.toBeInTheDocument();
    expect(screen.getByText('No activity yet')).toBeVisible();
  });

  it('shows record totals and enrolment by course and session, and filters by session', async () => {
    mockFetch(() => ({
      body: dashboard({
        workload: { resultsPublished: 3, documentsIssued: 2 },
        enrolment: {
          academicSessionId: null,
          byProgram: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              code: 'BSC',
              name: 'B.Sc',
              activeRegistrations: 40,
            },
            {
              id: '00000000-0000-4000-8000-000000000002',
              code: 'MBA',
              name: 'MBA',
              activeRegistrations: 10,
            },
          ],
          bySession: [
            {
              id: '00000000-0000-4000-8000-000000000003',
              code: '2026',
              name: '2026',
              activeRegistrations: 50,
            },
          ],
        },
      }),
    }));
    renderWithProviders(<DashboardView />, VIEWER);
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(records).toHaveTextContent('Published results3');
    expect(records).toHaveTextContent('Documents issued2');
    expect(records).not.toHaveTextContent('Draft results');
    const byCourse = screen.getByRole('list', { name: 'Active registrations by course' });
    expect(byCourse).toHaveTextContent('BSC');
    expect(byCourse).toHaveTextContent('40');
    expect(
      screen.getByRole('list', { name: 'Active registrations by academic session' }),
    ).toHaveTextContent('50');
  });

  it('offers a retry when the dashboard cannot load, without fabricating zeros', async () => {
    mockFetch(() => ({
      status: 503,
      body: { error: { code: 'UNAVAILABLE', message: 'Try again', requestId: 'test' } },
    }));
    renderWithProviders(<DashboardView />, VIEWER);
    expect(await screen.findByRole('button', { name: /retry|try again/i })).toBeVisible();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
