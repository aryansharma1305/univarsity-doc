// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ state: { status: 'anonymous' } }));
vi.mock('next/image', () => ({ default: () => <span data-testid="crest" /> }));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/server-auth', () => ({
  getSessionState: () => Promise.resolve(session.state),
}));
import AdminLoginPage from '@/app/admin/login/page';
import MfaVerifyPage from '@/app/admin/login/verify/page';
import { StudentAuthPage } from '@/features/student-portal/auth-page';

beforeEach(() => {
  session.state = { status: 'anonymous' };
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

it('shows only the crest and "Welcome to Staff Login Centre" before the staff login form', async () => {
  const { container } = render(await AdminLoginPage());
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    /^Welcome to Staff Login Centre$/,
  );
  expect(screen.getAllByRole('heading')).toHaveLength(1);
  // The page heading is in main (skip-link target); the brand panel repeats it visually only.
  expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBeInTheDocument();
  // The brand panel is decorative here: hidden from assistive technology, so no empty landmark.
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  const visual = container.querySelector('aside');
  if (!visual) throw new Error('brand panel missing');
  expect(visual).toHaveAttribute('aria-hidden', 'true');
  expect(visual.querySelector('a, button, input, [tabindex]')).toBeNull();
  expect(visual).toHaveTextContent(/^Welcome to Staff Login Centre$/);
  expect(within(visual).getByTestId('crest')).toBeInTheDocument();
  expect(within(visual).queryByRole('list', { hidden: true })).not.toBeInTheDocument();
  expect(within(visual).queryByRole('link', { hidden: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Staff sign in' })).not.toBeInTheDocument();
  for (const removed of [
    /For authorised university staff only/,
    /handled with care/,
    /Permissions by role/,
    /Academic Verification & Records Portal/,
  ]) {
    expect(screen.queryByText(removed)).not.toBeInTheDocument();
  }
  // The existing form, labels and switch are unchanged.
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Staff sign in' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it('keeps the availability notice when sign-in is unavailable', async () => {
  session.state = { status: 'unavailable' };
  render(await AdminLoginPage());
  expect(screen.getByRole('status')).toHaveTextContent('Sign-in is temporarily unavailable');
});

it('keeps the MFA step title, instructions and recovery option under the staff heading', async () => {
  session.state = {
    status: 'authenticated',
    user: { nextStep: 'MFA_VERIFY' },
  } as unknown as typeof session.state;
  render(await MfaVerifyPage());
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Two-step verification');
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Welcome to Staff Login Centre',
  );
  expect(
    screen.getByText('Enter the code from your authenticator app to finish signing in.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Lost your phone?')).toBeInTheDocument();
  expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument();
});

it('leaves student activation with its wordmark, steps and footer', () => {
  render(
    <StudentAuthPage
      title="Activate"
      description="Existing"
      unavailable={false}
      variant="activation"
    >
      <button>Existing activation form</button>
    </StudentAuthPage>,
  );
  const visual = screen.getByRole('complementary');
  expect(within(visual).getByRole('link', { name: 'Docversity home' })).toHaveAttribute(
    'href',
    '/',
  );
  expect(within(visual).getByText(/Academic Verification & Records Portal/)).toBeInTheDocument();
  expect(within(visual).getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByRole('heading', { level: 1, name: 'Activate' })).toBeInTheDocument();
});
