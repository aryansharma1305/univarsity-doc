// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VerificationPanel } from '@/features/public-verification/verification-panel';

const services = [
  ['admission-letter', 'Verify Admission Letter', 'Enter admission letter number'],
  ['certificate', 'Verify Certificate', 'Enter the code printed on the certificate'],
  ['registration', 'Verify Registration', 'Enter registration number'],
  ['result', 'Check Result', 'Enter result code or registration number'],
] as const;

afterEach(() => vi.unstubAllGlobals());

it.each(services)(
  'keeps %s references local and honestly reports availability',
  (service, title, placeholder) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<VerificationPanel service={service} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: placeholder });
    expect(input).toHaveAttribute('placeholder', placeholder);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('maxlength', '128');
    const form = input.closest('form');
    if (!form) throw new Error('Verification input must belong to a form');
    fireEvent.submit(form);
    expect(input).toBeInvalid();
    expect(screen.getByRole('status')).not.toHaveTextContent('No record has been checked');
    fireEvent.change(input, { target: { value: 'SYNTHETIC-REFERENCE' } });
    fireEvent.submit(form);
    expect(screen.getByRole('status')).toHaveTextContent('Coming in a later phase');
    expect(screen.getByRole('status')).toHaveTextContent('No record has been checked');
    expect(screen.getByRole('status')).not.toHaveTextContent('SYNTHETIC-REFERENCE');
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'CHANGED-REFERENCE' } });
    expect(screen.getByRole('status')).not.toHaveTextContent('No record has been checked');
  },
);
