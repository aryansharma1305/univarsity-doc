// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MfaEnrollment } from '@/features/auth/mfa-enrollment';
import { REGISTRAR, mockFetch, renderWithProviders } from './render';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace, push: vi.fn() }),
  usePathname: () => '/admin/security/mfa',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  refresh.mockReset();
});

const CODES = Array.from({ length: 10 }, (_, index) => `AAAA${'ABCDEFGHIJ'.charAt(index)}-BBBBB`);

function stub(confirm: { reauthenticate: boolean; user: unknown }) {
  return mockFetch((method, path) => {
    if (method === 'POST' && path === 'auth/mfa/enrollment') {
      return {
        body: {
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/Docversity:x?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          qrSvgDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
          expiresAt: '2026-11-18T10:10:00.000Z',
        },
      };
    }
    if (method === 'POST' && path === 'auth/mfa/enrollment/confirm') {
      return { body: { recoveryCodes: CODES, ...confirm } };
    }
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } } };
  });
}

async function enrollThroughUi() {
  const user = userEvent.setup();
  renderWithProviders(<MfaEnrollment required />);
  await user.click(screen.getByRole('button', { name: 'Set up authenticator app' }));
  await user.type(await screen.findByLabelText('Current password'), 'the current password');
  await user.type(screen.getByLabelText('Authenticator code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Confirm and turn on' }));
  await screen.findByTestId('recovery-codes');
  return user;
}

describe('MFA enrollment recovery codes', () => {
  it('shows the codes and continues on the rotated session', async () => {
    stub({ reauthenticate: false, user: { ...REGISTRAR, mfaEnabled: true, nextStep: null } });
    const user = await enrollThroughUi();
    expect(screen.getByTestId('recovery-codes').querySelectorAll('li')).toHaveLength(10);
    expect(screen.queryByTestId('mfa-reauthenticate')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'I have saved my recovery codes' }));
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/admin');
    });
  });

  it('still shows the codes when the session could not be rotated, then sends the user to sign in', async () => {
    stub({ reauthenticate: true, user: null });
    const user = await enrollThroughUi();
    expect(screen.getByTestId('recovery-codes').querySelectorAll('li')).toHaveLength(10);
    expect(screen.getByTestId('mfa-reauthenticate')).toHaveTextContent('sign in again');
    expect(replace).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'I have saved my recovery codes — sign in again' }),
    );
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/admin/login');
    });
  });
});
