// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminShell } from '@/components/admin/admin-shell';
import { ADMIN_NAV, NAV_GROUPS, visibleAdminNav } from '@/components/admin/nav';
import { activeNavHref } from '@/components/admin/nav-groups';
import { DashboardView } from '@/features/dashboard/dashboard-view';
import { resetApiClient } from '@/lib/api';
import { EMPTY_PAGE, mockFetch, renderWithProviders, VIEWER } from './render';

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
      'Certificates',
      'Course Management',
      'Subject Management',
      'Examination',
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
    expect(screen.getByRole('link', { name: /^Students$/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Payment Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Draft Results' })).not.toBeInTheDocument();
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

  it('renders API totals without fetching unauthorized pending queues', async () => {
    const fetch = mockFetch(() => ({
      body: {
        counts: { students: 123, activeRegistrations: 99, programs: 4, academicSessions: 2 },
        recentActivity: null,
      },
    }));
    renderWithProviders(<DashboardView />, VIEWER);
    expect(await screen.findByText('123')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Pending work' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tab', { name: 'Examination' })).not.toBeInTheDocument();
  });

  it('shows a real pending total only for an authorized queue', async () => {
    mockFetch((_method, path) => ({
      body:
        path === 'dashboard'
          ? {
              counts: { students: 5, activeRegistrations: 5, programs: 2, academicSessions: 1 },
              recentActivity: [],
            }
          : { ...EMPTY_PAGE, meta: { ...EMPTY_PAGE.meta, total: 7 } },
    }));
    renderWithProviders(<DashboardView />, {
      ...VIEWER,
      permissions: [...VIEWER.permissions, 'studentProfileRequests.read'],
    });
    expect(await screen.findByLabelText('7 pending profile requests')).toBeVisible();
    expect(screen.queryByText('Payment submissions')).not.toBeInTheDocument();
    expect(screen.getByText('No activity yet')).toBeVisible();
  });

  it('offers recovery for a failed pending queue without fabricating a zero', async () => {
    mockFetch((_method, path) =>
      path === 'dashboard'
        ? {
            body: {
              counts: { students: 5, activeRegistrations: 5, programs: 2, academicSessions: 1 },
              recentActivity: null,
            },
          }
        : {
            status: 503,
            body: { error: { code: 'UNAVAILABLE', message: 'Try again', requestId: 'test' } },
          },
    );
    renderWithProviders(<DashboardView />, {
      ...VIEWER,
      permissions: [...VIEWER.permissions, 'studentProfileRequests.read'],
    });
    expect(await screen.findByRole('button', { name: 'Retry profile requests' })).toBeVisible();
    expect(screen.queryByLabelText('0 pending profile requests')).not.toBeInTheDocument();
  });
});
