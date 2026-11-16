// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentAuthPage } from '@/features/student-portal/auth-page';

vi.mock('next/image', () => ({ default: () => <span data-testid="crest" /> }));
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

it('shows only the welcome heading and animated crest in the student sign-in visual', () => {
  const { container } = render(
    <StudentAuthPage title="Sign in" description="Existing form description" unavailable={false}>
      <button>Existing login form</button>
    </StudentAuthPage>,
  );
  const visual = screen.getByRole('complementary');
  expect(visual).toHaveTextContent(/^Welcome to Verification Portal$/);
  expect(within(visual).queryByRole('list')).not.toBeInTheDocument();
  expect(within(visual).queryByRole('link')).not.toBeInTheDocument();
  expect(within(visual).getByTestId('crest')).toBeInTheDocument();
  expect(container.querySelector('[aria-hidden="true"] svg g')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Existing login form' })).toBeInTheDocument();
});

it('preserves the activation guidance and form', () => {
  render(
    <StudentAuthPage
      title="Activate"
      description="Existing description"
      unavailable={false}
      variant="activation"
    >
      <button>Existing activation form</button>
    </StudentAuthPage>,
  );
  expect(screen.getByText('Your code from the registrar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Existing activation form' })).toBeInTheDocument();
});
