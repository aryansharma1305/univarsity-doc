// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepartmentDialog } from '@/features/departments/department-dialog';
import { DepartmentsView } from '@/features/departments/departments-view';
import { EMPTY_PAGE, VIEWER, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/departments',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const department = {
  id: '01900000-0000-7000-8000-0000000000aa',
  code: 'CSE',
  name: 'Computer Science',
  status: 'ACTIVE',
  programCount: 2,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

describe('DepartmentsView', () => {
  it('shows a loading skeleton, then an empty state with a CTA for writers', async () => {
    mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<DepartmentsView />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(await screen.findByText('No departments yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add department' }).length).toBeGreaterThan(0);
  });

  it('hides create and row actions from read-only users', async () => {
    mockFetch(() => ({
      body: {
        ...EMPTY_PAGE,
        data: [department],
        meta: { ...EMPTY_PAGE.meta, total: 1, totalPages: 1 },
      },
    }));
    renderWithProviders(<DepartmentsView />, VIEWER);
    expect((await screen.findAllByText('CSE')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Add department' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for CSE/ })).not.toBeInTheDocument();
  });

  it('renders an explicit permission state on 403', async () => {
    mockFetch(() => ({
      status: 403,
      body: {
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to do that.',
          requestId: 'r1',
        },
      },
    }));
    renderWithProviders(<DepartmentsView />);
    expect(await screen.findByText('You don’t have access to this')).toBeInTheDocument();
  });
});

describe('DepartmentDialog', () => {
  it('shows field errors from the shared schema without calling the API', async () => {
    const fetchMock = mockFetch(() => ({ body: department }));
    renderWithProviders(<DepartmentDialog open onOpenChange={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/Code/), 'HAS SPACE');
    await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(
      screen.getByText('Use letters, digits, ".", "_", "/" or "-" (no spaces).'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Code/)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a server conflict on the right field', async () => {
    mockFetch((method) =>
      method === 'POST'
        ? {
            status: 409,
            body: {
              error: {
                code: 'CONFLICT',
                message: 'A department with this code already exists.',
                requestId: 'r2',
                details: [{ path: 'code', message: 'A department with this code already exists.' }],
              },
            },
          }
        : { body: EMPTY_PAGE },
    );
    const onOpenChange = vi.fn();
    renderWithProviders(<DepartmentDialog open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText(/Code/), 'CSE');
    await userEvent.type(screen.getByLabelText(/Name/), 'Computer Science');
    await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
    expect(
      await screen.findByText('A department with this code already exists.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/Code/)).toHaveAttribute('aria-invalid', 'true');
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
