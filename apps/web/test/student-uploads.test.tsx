// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudentUpload } from '@docversity/validation';
import { StudentUploads } from '@/features/student-portal/student-uploads';
import { StudentUploadsPanel } from '@/features/students/student-uploads-panel';
import { mockFetch, renderWithProviders } from './render';

const passport: StudentUpload = {
  id: '01900000-0000-7000-8000-0000000000e1',
  category: 'IDENTITY_PASSPORT',
  contentType: 'application/pdf',
  sizeBytes: 200_000,
  uploadedAt: '2026-11-20T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

const csrf = (path: string) =>
  path === 'student-auth/csrf' ? { body: { csrfToken: 'student-token' } } : undefined;

describe('student uploads (My Documents)', () => {
  it('lists every academic and identity category with honest states', () => {
    render(<StudentUploads initial={[passport]} />);
    const academic = screen.getByRole('list', { name: 'Academic documents' });
    expect(
      within(academic)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual([
      'Class 10 / School Certificate',
      'Class 12 / Higher Secondary',
      'Bachelor’s Degree',
      'Master’s Degree',
      'Others',
    ]);
    const identity = screen.getByRole('list', { name: 'Identity documents' });
    expect(
      within(identity)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['National ID', 'Passport', 'PAN Card', 'Driving Licence', 'Other Identity Proof']);
    expect(screen.getByRole('link', { name: /View Passport/ })).toHaveAttribute(
      'href',
      '/api/v1/student/uploads/IDENTITY_PASSPORT/file?disposition=inline',
    );
    expect(screen.getByRole('button', { name: 'Replace Passport' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload National ID' })).toBeInTheDocument();
    // No identity numbers are ever asked for: files only.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('uploads a file through the student API with the student CSRF token', async () => {
    const fetchMock = mockFetch((method, path) => {
      const token = csrf(path);
      if (token) return token;
      expect([method, path]).toEqual(['POST', 'student/uploads/IDENTITY_PAN']);
      return { status: 201, body: { ...passport, category: 'IDENTITY_PAN' } };
    });
    render(<StudentUploads initial={[]} />);
    const input = screen
      .getByRole('list', { name: 'Identity documents' })
      .querySelectorAll('input[type="file"]')[2] as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png');
    fireEvent.change(input, {
      target: { files: [new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('File uploaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace PAN Card' })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('uploads/IDENTITY_PAN'),
    );
    expect(new Headers(call?.[1]?.headers).get('X-CSRF-Token')).toBe('student-token');
  });

  it('refuses oversized files before sending anything', () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    render(<StudentUploads initial={[]} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('missing file input');
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 16 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(screen.getByRole('alert')).toHaveTextContent('larger than 15 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation', async () => {
    mockFetch((method, path) => {
      const token = csrf(path);
      if (token) return token;
      expect([method, path]).toEqual(['DELETE', 'student/uploads/IDENTITY_PASSPORT']);
      return { status: 204, body: null };
    });
    render(<StudentUploads initial={[passport]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Passport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Passport' }));
    expect(await screen.findByText('File deleted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload Passport' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View Passport/ })).not.toBeInTheDocument();
  });

  it('says so when the list could not be loaded', () => {
    render(<StudentUploads initial={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('staff Student uploads panel', () => {
  it('is read-only and loads nothing until opened', async () => {
    const fetchMock = mockFetch(() => ({ body: { data: [passport] } }));
    const view = renderWithProviders(
      <StudentUploadsPanel studentId="01900000-0000-7000-8000-0000000000f0" active={false} />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    view.unmount();
    renderWithProviders(
      <StudentUploadsPanel studentId="01900000-0000-7000-8000-0000000000f0" active />,
    );
    expect(await screen.findByRole('heading', { name: 'Student uploads' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Download Passport' })).toHaveAttribute(
        'href',
        `/api/v1/students/01900000-0000-7000-8000-0000000000f0/uploads/${passport.id}/file?disposition=attachment`,
      );
    });
    expect(screen.getAllByText('Not uploaded')).toHaveLength(9);
    // Regaining focus must not re-list (each list view is audited).
    const calls = fetchMock.mock.calls.length;
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(screen.queryByRole('button', { name: /Upload|Delete|Replace/ })).not.toBeInTheDocument();
  });
});
