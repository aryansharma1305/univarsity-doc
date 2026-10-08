// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, StudentAccountRow } from '@docversity/validation';
import { StudentActivationForm, StudentLoginForm } from '@/features/student-portal/auth-forms';
import { StudentAccountsView } from '@/features/student-accounts/student-accounts-view';
import { EMPTY_PAGE, REGISTRAR, VIEWER, mockFetch, renderWithProviders } from './render';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/student-accounts',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
});

const csrf = { body: { csrfToken: 'student-token' } };

describe('student activation form', () => {
  it('checks the password confirmation before sending anything', async () => {
    const fetchMock = mockFetch(() => csrf);
    renderWithProviders(<StudentActivationForm />);
    await userEvent.type(screen.getByLabelText('Registration number'), 'DEV-1');
    await userEvent.type(screen.getByLabelText('Activation code'), 'ABCD-EFGH-JKLM');
    await userEvent.type(screen.getByLabelText('New password'), 'a long student passphrase');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'something else entirely');
    await userEvent.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the generic activation failure and uses the STUDENT csrf endpoint', async () => {
    const calls: string[] = [];
    mockFetch((method, path) => {
      calls.push(`${method} ${path}`);
      if (path === 'student-auth/csrf') return csrf;
      return {
        status: 400,
        body: {
          error: {
            code: 'STUDENT_ACTIVATION_FAILED',
            message:
              'The registration number or activation code is not valid, or the code has expired or been used.',
            requestId: 'r1',
          },
        },
      };
    });
    renderWithProviders(<StudentActivationForm />);
    await userEvent.type(screen.getByLabelText('Registration number'), 'DEV-1');
    await userEvent.type(screen.getByLabelText('Activation code'), 'ABCD-EFGH-JKLM');
    await userEvent.type(screen.getByLabelText('New password'), 'a long student passphrase');
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'a long student passphrase',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /not valid, or the code has expired/,
    );
    expect(calls).toEqual(['GET student-auth/csrf', 'POST student-auth/activate']);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('student login form', () => {
  it('explains a failed sign-in without revealing which part was wrong', async () => {
    mockFetch((_method, path) =>
      path === 'student-auth/csrf'
        ? csrf
        : {
            status: 401,
            body: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'x', requestId: 'r' } },
          },
    );
    renderWithProviders(<StudentLoginForm />);
    await userEvent.type(screen.getByLabelText('Registration number'), 'DEV-1');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The registration number or password is incorrect, or the account has not been activated yet.',
    );
  });
});

const row: StudentAccountRow = {
  registrationId: '01900000-0000-7000-8000-0000000000a1',
  registrationNumber: 'DEV-IMPORT-0001',
  studentId: '01900000-0000-7000-8000-0000000000b1',
  studentName: 'Test Student One',
  program: { id: '01900000-0000-7000-8000-0000000000c1', code: 'DEV-P', name: 'Dev Program' },
  academicSession: {
    id: '01900000-0000-7000-8000-0000000000d1',
    code: 'DEV-S',
    name: 'Dev Session',
  },
  registrationStatus: 'ACTIVE',
  state: 'NO_ACCOUNT',
  account: null,
  openCode: null,
};

const MANAGER: AuthUser = {
  ...REGISTRAR,
  permissions: [...REGISTRAR.permissions, 'studentAccounts.read', 'studentAccounts.manage'],
};

describe('student accounts administration', () => {
  it('issues codes for the selected registrations and shows them once', async () => {
    mockFetch((method, path) => {
      if (method === 'POST' && path === 'student-accounts/activation-codes') {
        return {
          body: {
            issued: [
              {
                registrationId: row.registrationId,
                registrationNumber: row.registrationNumber,
                studentName: row.studentName,
                programCode: 'DEV-P',
                code: 'ABCD-EFGH-JKLM',
                expiresAt: '2026-11-07T00:00:00.000Z',
              },
            ],
            skipped: [],
          },
        };
      }
      if (path.startsWith('programs') || path.startsWith('academic-sessions'))
        return { body: EMPTY_PAGE };
      return {
        body: { ...EMPTY_PAGE, data: [row], meta: { ...EMPTY_PAGE.meta, total: 1, totalPages: 1 } },
      };
    });
    renderWithProviders(<StudentAccountsView />, MANAGER);
    expect((await screen.findAllByText('Not activated')).length).toBeGreaterThan(0);
    const [checkbox] = screen.getAllByRole('checkbox', { name: 'Select DEV-IMPORT-0001' });
    if (!checkbox) throw new Error('no checkbox');
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole('button', { name: 'Issue activation codes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activation codes' });
    expect(dialog).toHaveTextContent('ABCD-EFGH-JKLM');
    expect(dialog).toHaveTextContent(/Shown once/);
    await waitFor(() => {
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    });
  });

  it('offers no actions to users who may only read', async () => {
    mockFetch((_method, path) =>
      path.startsWith('programs') || path.startsWith('academic-sessions')
        ? { body: EMPTY_PAGE }
        : {
            body: {
              ...EMPTY_PAGE,
              data: [row],
              meta: { ...EMPTY_PAGE.meta, total: 1, totalPages: 1 },
            },
          },
    );
    renderWithProviders(<StudentAccountsView />, {
      ...VIEWER,
      permissions: [...VIEWER.permissions, 'studentAccounts.read'],
    });
    expect((await screen.findAllByText('DEV-IMPORT-0001')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });
});
