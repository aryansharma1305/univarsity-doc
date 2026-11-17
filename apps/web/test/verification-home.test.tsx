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
    render(<VerificationHome year={2026} />);
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(navigation);
    expect(screen.queryByRole('link', { name: 'Docversity home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Staff|Help|Contact/ })).not.toBeInTheDocument();
  });

  it('is a distinct animated homepage, not the admission-letter form', () => {
    render(<VerificationHome year={2026} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /Verify\.\s*Trust\.\s*Confirm\./,
    );
    expect(screen.getByRole('img', { name: 'Docversity University' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Activate your account/ })).toHaveAttribute(
      'href',
      '/student/register',
    );
    expect(
      screen.queryByRole('heading', { name: 'Verify Admission Letter' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Verify$/ })).not.toBeInTheDocument();
  });

  it('keeps the mentor-removed subtitle and badge row out', () => {
    render(<VerificationHome year={2026} />);
    expect(
      screen.queryByText(/Single-use activation codes|Only your own records|Separate staff access/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/examination services in one secure student portal/),
    ).not.toBeInTheDocument();
  });

  it('uses the same five destinations in the mobile drawer and closes on navigation', () => {
    render(<VerificationHome year={2026} />);
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
