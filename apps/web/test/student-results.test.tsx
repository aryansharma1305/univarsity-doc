// @vitest-environment jsdom
import { randomUUID } from 'node:crypto';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { StudentResults } from '@/features/student-portal/student-results';
import { STUDENT_NAV } from '@/features/student-portal/nav';
const empty = {
  publicationAvailable: false,
  data: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
} as const;
describe('student results', () => {
  it('shows honest publication empty state with no marks, grades or official download', () => {
    render(<StudentResults results={{ ...empty, data: [] }} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "Your results haven't been published yet. They'll appear here when your university releases them.",
    );
    expect(screen.getByRole('link', { name: 'View examinations' })).toHaveAttribute(
      'href',
      '/student/examinations',
    );
    expect(screen.getByRole('link', { name: 'My Documents' })).toHaveAttribute(
      'href',
      '/student/documents',
    );
    expect(screen.queryByText(/CGPA|SGPA|Pass|Fail|\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(STUDENT_NAV.find((x) => x.href === '/student/results')?.available).toBe(true);
  });
  it('renders only server-supplied synthetic result cards with an explicit non-official disclaimer', () => {
    render(
      <StudentResults
        results={{
          ...empty,
          data: [
            {
              id: randomUUID(),
              resultId: randomUUID(),
              registrationId: randomUUID(),
              usage: 'SYNTHETIC_ONLY',
              label: 'SAMPLE — not an official result',
              examination: 'Synthetic examination',
              attemptNumber: 1,
              periodNumber: 1,
              sgpa: '9.000',
              outcome: 'PASS',
              publishedAt: new Date().toISOString(),
              subjects: [
                {
                  programSubjectId: randomUUID(),
                  code: 'SYN-101',
                  name: 'Synthetic subject',
                  totalMarks: '80',
                  maxMarks: '100',
                  grade: 'A',
                },
              ],
            },
          ],
          meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
        }}
      />,
    );
    expect(screen.getByRole('article', { name: 'Synthetic examination' })).toHaveTextContent(
      'Sample GPA 9.000',
    );
    expect(screen.getByText('SAMPLE — not an official result')).toBeVisible();
    expect(screen.getByText(/Synthetic preview only/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
  });
  it('distinguishes error from empty data and refreshes through the retry action', () => {
    render(<StudentResults results={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Results couldn't be loaded");
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
