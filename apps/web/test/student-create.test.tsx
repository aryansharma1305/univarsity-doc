// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentCreateView } from '@/features/students/student-create-view';
import { EMPTY_PAGE, VIEWER, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/students/new',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StudentCreateView', () => {
  it('validates required fields in both sections before submitting', async () => {
    const fetchMock = mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<StudentCreateView />);
    await userEvent.click(screen.getByRole('button', { name: 'Create student' }));
    expect(await screen.findByText('Enter the full name.')).toBeInTheDocument();
    expect(screen.getByText('Enter the registration number.')).toBeInTheDocument();
    expect(screen.getByText('Choose a program.')).toBeInTheDocument();
    expect(screen.getByText('Choose an academic session.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('does not offer the form to users who may not create students', () => {
    mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<StudentCreateView />, VIEWER);
    expect(screen.getByText('You don’t have access to this')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create student' })).not.toBeInTheDocument();
  });
});
