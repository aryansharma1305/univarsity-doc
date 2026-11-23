// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsLink } from '@/components/admin/notifications-link';
import { StaffUsersView } from '@/features/staff-users/staff-users-view';
import { resetApiClient } from '@/lib/api';
import { mockFetch, renderWithProviders, VIEWER } from './render';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/settings/staff',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const ADMIN = {
  ...VIEWER,
  roles: ['SUPER_ADMIN'],
  permissions: [...VIEWER.permissions, 'users.manage'],
};
const user = (id: string, over: object = {}) => ({
  id,
  email: `${id.slice(-4)}@example.test`,
  displayName: `Synthetic ${id.slice(-4)}`,
  roles: ['VIEWER'],
  status: 'ACTIVE',
  mfaEnabled: false,
  passwordChangeRequired: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
});
const OTHER = '01900000-0000-7000-8000-00000000aaaa';
const DISABLED = '01900000-0000-7000-8000-00000000bbbb';

beforeEach(() => {
  resetApiClient();
});

describe('staff users and roles', () => {
  it('is forbidden without users.manage', () => {
    mockFetch(() => ({ body: { data: [] } }));
    renderWithProviders(<StaffUsersView />, VIEWER);
    expect(screen.queryByRole('button', { name: 'Add staff account' })).not.toBeInTheDocument();
  });

  it('offers actions for others only, and re-enable for disabled accounts', async () => {
    mockFetch(() => ({
      body: {
        data: [
          user(ADMIN.id, { roles: ['SUPER_ADMIN'] }),
          user(OTHER),
          user(DISABLED, { status: 'DISABLED' }),
        ],
      },
    }));
    renderWithProviders(<StaffUsersView />, ADMIN);
    const list = await screen.findByRole('list', { name: 'Staff users' });
    const [self, other, disabled] = within(list).getAllByRole('listitem');
    if (!self || !other || !disabled) throw new Error('three staff expected');
    expect(within(self).queryByRole('button')).not.toBeInTheDocument();
    expect(within(other).getByRole('button', { name: 'Change roles' })).toBeVisible();
    expect(within(disabled).getByRole('button', { name: 'Re-enable' })).toBeVisible();
    expect(
      within(disabled).queryByRole('button', { name: 'Change roles' }),
    ).not.toBeInTheDocument();
  });

  it('changes roles through the API with the ticked roles only', async () => {
    const fetch = mockFetch((method, path, body) => ({
      body:
        method === 'PATCH'
          ? user(OTHER, { roles: (body as { roles: string[] }).roles })
          : { data: [user(OTHER)] },
    }));
    renderWithProviders(<StaffUsersView />, ADMIN);
    await userEvent.click(await screen.findByRole('button', { name: 'Change roles' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /APPROVER/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save roles' }));
    await waitFor(() => {
      const call = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(call?.[0]).toContain(`/api/v1/staff-users/${OTHER}/roles`);
      const sent = call?.[1]?.body;
      expect(typeof sent === 'string' ? JSON.parse(sent) : null).toEqual({
        roles: ['APPROVER', 'VIEWER'],
      });
    });
  });

  it('shows the server refusal instead of closing the dialog', async () => {
    mockFetch((method) =>
      method === 'PATCH'
        ? {
            status: 409,
            body: {
              error: {
                code: 'CONFLICT',
                message: 'The last active SUPER_ADMIN must keep the SUPER_ADMIN role.',
                requestId: 't',
              },
            },
          }
        : { body: { data: [user(OTHER, { roles: ['SUPER_ADMIN'] })] } },
    );
    renderWithProviders(<StaffUsersView />, ADMIN);
    await userEvent.click(await screen.findByRole('button', { name: 'Change roles' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /SUPER ADMIN/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /VIEWER/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save roles' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('last active SUPER_ADMIN');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('header badge shows the real unread count', async () => {
    mockFetch(() => ({ body: { unread: 3 } }));
    renderWithProviders(<NotificationsLink />, ADMIN);
    expect(await screen.findByRole('link', { name: 'Notifications, 3 unread' })).toHaveAttribute(
      'href',
      '/admin/notifications',
    );
  });
});
