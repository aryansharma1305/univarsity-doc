// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
import { VerificationHome } from '@/features/public-verification/verification-home';

const titles = [
  'Result Checking',
  'Registration Verification',
  'Certificate Verification',
  'Admission Letter Verification',
];
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
  it('shows exactly four services with Result Checking selected and an unavailable panel', () => {
    render(<VerificationHome year={2026} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    for (const name of titles) expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Result Checking' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Not available yet');
    expect(screen.queryByRole('tab', { name: /QR/ })).not.toBeInTheDocument();
  });
  it('changes panels without fetching, collecting identifiers or producing verification results', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(<VerificationHome year={2026} />);
    for (const name of titles) {
      fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
      expect(screen.getByRole('heading', { name, level: 2 })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Not available yet');
      expect(container.querySelectorAll('form,input,textarea')).toHaveLength(0);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses direct service selection without redundant hero actions and preserves portal links', () => {
    render(<VerificationHome year={2026} />);
    expect(screen.queryByRole('button', { name: 'Verify Certificate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View Services' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Student portal' })).toHaveAttribute(
      'href',
      '/student/login',
    );
    expect(screen.getByRole('link', { name: 'Staff access' })).toHaveAttribute(
      'href',
      '/admin/login',
    );
  });
});
