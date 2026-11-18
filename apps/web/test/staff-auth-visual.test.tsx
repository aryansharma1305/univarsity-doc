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
  render(await AdminLoginPage());
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    /^Welcome to Staff Login Centre$/,
  );
  expect(screen.getAllByRole('heading')).toHaveLength(1);
  const visual = screen.getByRole('complementary');
  expect(visual).toHaveTextContent(/^Welcome to Staff Login Centre$/);
  expect(within(visual).getByTestId('crest')).toBeInTheDocument();
  expect(within(visual).queryByRole('list')).not.toBeInTheDocument();
  expect(within(visual).queryByRole('link')).not.toBeInTheDocument();
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

it('uses the same layout hook as student sign-in, which keeps its own heading and description', () => {
  const { container } = render(
    <StudentAuthPage title="Sign in" description="Existing description" unavailable={false}>
      <button>Existing login form</button>
    </StudentAuthPage>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Welcome to Verification Portal',
  );
  expect(screen.getByText('Existing description')).toBeInTheDocument();
  expect(container.querySelector('[data-audience="student"]')).toBeInTheDocument();
});
