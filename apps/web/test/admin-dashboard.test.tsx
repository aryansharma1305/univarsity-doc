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

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/results/import',
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ replace: navigation.replace, refresh: vi.fn() }),
}));

beforeEach(() => {
  navigation.search = '';
  navigation.replace.mockReset();
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

const SESSION_ID = '00000000-0000-4000-8000-000000000003';
const SESSIONS = {
  data: [
    {
      id: SESSION_ID,
      code: '2026',
      name: 'Session 2026',
      startsOn: null,
      endsOn: null,
      status: 'ACTIVE',
      registrationCount: 50,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
};

/** A dashboard response: queues the account may not read are null, as the API returns them. */
function dashboard(
  overrides: {
    recentActivity?: unknown[] | null;
    workload?: Partial<Record<keyof typeof NO_WORKLOAD, number | null>>;
    enrolment?: unknown;
    academicSession?: unknown;
  } = {},
) {
  return {
    academicSession: overrides.academicSession ?? null,
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
    const paths: string[] = [];
    mockFetch((_method, path) => {
      paths.push(path);
      return { body: path === 'dashboard' ? dashboard() : SESSIONS };
    });
    renderWithProviders(<DashboardView />, VIEWER);
    expect(await screen.findByText('123')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Pending work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Records' })).not.toBeInTheDocument();
    expect(paths.filter((path) => path === 'dashboard')).toHaveLength(1);
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

  it('scopes the whole dashboard to the session in the URL and labels global queues', async () => {
    navigation.search = `session=${SESSION_ID}`;
    const queries: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.endsWith('/dashboard')) queries.push(url.search);
        return Promise.resolve(
          Response.json(
            url.pathname.endsWith('/dashboard')
              ? dashboard({
                  academicSession: {
                    id: SESSION_ID,
                    code: '2026',
                    name: 'Session 2026',
                    status: 'ACTIVE',
                  },
                  recentActivity: [],
                  workload: { profileRequestsPending: 2, reExamApplicationsPending: 1 },
                })
              : SESSIONS,
          ),
        );
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<DashboardView />, {
      ...VIEWER,
      permissions: [
        ...VIEWER.permissions,
        'studentProfileRequests.review',
        'reExamApplications.decide',
      ],
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Showing records for2026 — Session 2026',
    );
    expect(queries).toEqual([`?academicSessionId=${SESSION_ID}`]);
    // Session-linked queues carry no label; queues without a session link say they are global.
    expect(screen.getByText(/Changes awaiting a staff decision · All sessions/)).toBeVisible();
    expect(screen.getByText('Applications awaiting a staff decision')).toBeVisible();
    expect(screen.getByRole('link', { name: /Total students/ })).toHaveAttribute(
      'href',
      `/admin/students?session=${SESSION_ID}`,
    );
    await user.click(screen.getByRole('button', { name: 'Show all sessions' }));
    expect(navigation.replace).toHaveBeenCalledWith('/admin/results/import', { scroll: false });
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
