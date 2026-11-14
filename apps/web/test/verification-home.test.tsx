// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
import { VerificationHome } from '@/features/public-verification/verification-home';

const navigation = [
  ['Verify Admission Letter', '/verify/admission-letter'],
  ['Verify Certificate', '/verify/certificate'],
  ['Verify Registration', '/verify/registration'],
  ['Check Result', '/results'],
  ['Student Sign in', '/student/login'],
] as const;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public verification homepage', () => {
  it('shows exactly the five header destinations in order', () => {
    render(<VerificationHome />);
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(navigation);
    expect(screen.queryByRole('link', { name: 'Docversity home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Staff|Help|Contact/ })).not.toBeInTheDocument();
  });

  it('replaces the large hero, CTA badges and footer with the verification box', () => {
    const { container } = render(<VerificationHome />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Verify Admission Letter' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Enter admission letter number' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Verify$/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Coming in a later phase');
    expect(container.querySelectorAll('main section')).toHaveLength(1);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Single-use activation codes|Only your own records|Separate staff access/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Verify.')).not.toBeInTheDocument();
  });

  it('uses the same five destinations in the mobile drawer and closes on navigation', () => {
    render(<VerificationHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const links = within(screen.getByRole('navigation', { name: 'Mobile' })).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(navigation);
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', {
        name: 'Verify Admission Letter',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
