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
  it('shows the exact five header destinations in order and the home brand', () => {
    render(<VerificationHome year={2026} />);
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(navigation);
    expect(screen.getByRole('link', { name: 'Docversity home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /Staff|Help|Contact/ })).not.toBeInTheDocument();
  });

  it('renders only the original hero and minimal legal footer', () => {
    const { container } = render(<VerificationHome year={2026} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /^Verify\.\s*Trust\. Confirm\.$/,
    );
    expect(screen.getByRole('img', { name: 'Docversity University' })).toBeInTheDocument();
    expect(container.querySelectorAll('main section')).toHaveLength(1);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(
      container.querySelector('#services,#students,#how,#privacy,#portals,#roadmap,#faq'),
    ).toBeNull();
    expect(
      within(screen.getByRole('contentinfo'))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Privacy', 'Terms']);
    expect(screen.getByRole('link', { name: 'Sign in to the student portal' })).toHaveAttribute(
      'href',
      '/student/login',
    );
    expect(screen.getByRole('link', { name: 'Activate your account' })).toHaveAttribute(
      'href',
      '/student/register',
    );
  });

  it('discloses verification unavailability without identifiers or network requests', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<VerificationHome year={2026} />);
    expect(
      screen.getByText(/with public verification of results and certificates on its way/),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('form,input,textarea,select')).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
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
