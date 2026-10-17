// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/features/student-portal/student-motion', () => ({
  StudentActionMotion: ({ children }: { children: React.ReactNode }) => children,
}));
import { StudentCertificateSamples } from '@/features/student-portal/certificate-samples';
it('offers only the fixed authenticated preview/download without any personal-data inputs', () => {
  const { container } = render(<StudentCertificateSamples />);
  expect(screen.getByRole('heading', { name: 'View Sample Certificate' })).toBeInTheDocument();
  expect(
    screen.getByText(
      'An illustrative certificate layout with fictional details and unsigned signatures.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/approved sample layout/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Preview Sample (opens in a new tab)' })).toHaveAttribute(
    'href',
    '/api/v1/student/certificate-samples/sample-training-v1/file?disposition=inline',
  );
  expect(screen.getByRole('link', { name: 'Download Sample PDF' })).toHaveAttribute(
    'href',
    '/api/v1/student/certificate-samples/sample-training-v1/file?disposition=attachment',
  );
  expect(container.querySelectorAll('input,form,textarea')).toHaveLength(0);
  expect(
    screen.getByText(
      "This is a sample certificate for reference only. Your final certificate may vary according to your course and the university's approved format.",
    ),
  ).toBeInTheDocument();
  for (const text of [
    'Not an issued certificate.',
    'Not valid for verification.',
    'Does not indicate course completion.',
    'Does not guarantee eligibility or issuance.',
  ])
    expect(screen.getByText(text)).toBeInTheDocument();
  expect(
    screen.getByText(
      /Transcript, Provisional, Character and Migration samples are not available yet/,
    ),
  ).toBeInTheDocument();
});
