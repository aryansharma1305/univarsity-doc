// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { IssuedDocuments } from '@/features/student-portal/issued-documents';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn((url: string) => Promise.resolve(`data:image/png;qr,${url}`)) },
}));

const TOKEN = 'b'.repeat(43);
const documents = [
  {
    id: '019a0000-0000-7000-8000-000000000001',
    documentType: 'ADMISSION_LETTER',
    certificateNumber: 'SYN-AL-0001',
    issueDate: '2026-11-01',
    verificationUrl: `https://verify.example.invalid/verify/admission-letter#token=${TOKEN}`,
  },
  {
    id: '019a0000-0000-7000-8000-000000000002',
    documentType: 'TRANSCRIPT',
    certificateNumber: 'SYN-TR-0002',
    issueDate: '2026-11-02',
  },
];

it('shows the owner a scannable QR of their own document only on request', async () => {
  render(<IssuedDocuments documents={documents} />);
  expect(screen.queryByRole('img', { name: 'Verification QR code' })).not.toBeInTheDocument();
  // Only documents that carry a credential offer a QR.
  expect(screen.getAllByRole('button', { name: 'Show verification QR' })).toHaveLength(1);
  const toggle = screen.getByRole('button', { name: 'Show verification QR' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  const qr = await screen.findByRole('img', { name: 'Verification QR code' });
  expect(qr.getAttribute('src')).toContain(`/verify/admission-letter#token=${TOKEN}`);
  expect(screen.getByRole('button', { name: 'Hide verification QR' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Hide verification QR' }));
  expect(screen.queryByRole('img', { name: 'Verification QR code' })).not.toBeInTheDocument();
});
