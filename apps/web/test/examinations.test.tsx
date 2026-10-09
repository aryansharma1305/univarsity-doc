// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, ExaminationRow, StudentExaminations } from '@docversity/validation';
import { ExamAppView } from '@/features/examinations/exam-app-view';
import { ExaminationsView } from '@/features/examinations/examinations-view';
import { StudentExaminationsPage } from '@/features/student-portal/student-examinations';
import { EMPTY_PAGE, REGISTRAR, VIEWER, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/examinations',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const EXAM_ADMIN: AuthUser = {
  ...REGISTRAR,
  roles: ['EXAM_ADMIN'],
  permissions: [...VIEWER.permissions, 'examinations.read', 'examinations.manage'],
};
const READER: AuthUser = { ...VIEWER, permissions: [...VIEWER.permissions, 'examinations.read'] };

const program = { id: '01900000-0000-7000-8000-0000000000c1', code: 'TP', name: 'Test Program' };
const session = { id: '01900000-0000-7000-8000-0000000000c2', code: 'S26', name: 'Session 2026' };

const data = (overrides: Partial<StudentExaminations> = {}): StudentExaminations => ({
  applications: [
    {
      id: '01900000-0000-7000-8000-0000000000a1',
      name: 'Synthetic Exam App',
      websiteUrl: 'https://exams.example.test',
      androidUrl: 'https://play.example.test/app',
      iosUrl: null,
      instructions: 'Sign in with your registration number.',
    },
  ],
  registrations: [
    {
      registrationId: '01900000-0000-7000-8000-0000000000b1',
      registrationNumber: 'TEST-REG-1',
      program,
      academicSession: session,
      curriculum: {
        versionCode: 'V2026',
        name: 'Syllabus 2026',
        structureType: 'YEAR_WISE',
        periods: [
          { number: 1, label: 'Year 1' },
          { number: 2, label: 'Year 2' },
        ],
      },
      examinations: [
        {
          id: '01900000-0000-7000-8000-0000000000e1',
          name: 'Year 2 Re-examination',
          kind: 'RE_EXAMINATION',
          examSession: 'May–June 2026',
          examType: null,
          period: { number: 2, label: 'Year 2' },
          reExamApplicationsOpen: true,
        },
      ],
    },
  ],
  ...overrides,
});

describe('student examinations page', () => {
  it('links to the external application, states exams happen outside Docversity and shows year-wise periods', () => {
    render(<StudentExaminationsPage data={data()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Examinations' })).toBeInTheDocument();
    expect(screen.getByText(/not in this portal/)).toBeInTheDocument();
    expect(screen.getByText(/does not\s+register you for an examination/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the official website/ })).toHaveAttribute(
      'href',
      'https://exams.example.test',
    );
    expect(screen.getByRole('link', { name: /for Android/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    // No iOS link was configured → no iOS button.
    expect(screen.queryByRole('link', { name: /iPhone/ })).not.toBeInTheDocument();
    expect(screen.getByText('Sign in with your registration number.')).toBeInTheDocument();
    const periods = screen.getByRole('list', { name: 'Course periods' });
    expect(
      within(periods)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Year 1', 'Year 2']);
    expect(screen.getByText(/Re-examination · Year 2 · May–June 2026/)).toBeInTheDocument();
  });

  it('shows honest states when nothing is configured, assigned or available', () => {
    const view = render(
      <StudentExaminationsPage
        data={data({
          applications: [],
          registrations: [
            {
              registrationId: '01900000-0000-7000-8000-0000000000b2',
              registrationNumber: 'TEST-REG-2',
              program,
              academicSession: session,
              curriculum: null,
              examinations: [],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('Examination application not configured yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /official website/ })).not.toBeInTheDocument();
    expect(screen.getByText('No syllabus assigned yet')).toBeInTheDocument();
    view.rerender(<StudentExaminationsPage data={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('admin examinations', () => {
  const row: ExaminationRow = {
    id: '01900000-0000-7000-8000-0000000000e2',
    code: 'EXM-1',
    name: 'Semester 1 Examination',
    kind: 'REGULAR',
    examType: null,
    examSession: 'Nov 2026',
    status: 'OPEN',
    program,
    curriculum: {
      id: '01900000-0000-7000-8000-0000000000f1',
      versionCode: 'V2026',
      name: 'Syllabus',
      structureType: 'SEMESTER_WISE',
      numberOfPeriods: 2,
    },
    academicSession: session,
    period: { number: 1, label: 'Semester 1' },
    reExamApplicationsOpen: false,
    createdAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-09T10:00:00.000Z',
  };

  it('lists records with their semester/year and hides creation without the manage permission', async () => {
    mockFetch(() => ({
      body: { data: [row], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } },
    }));
    const view = renderWithProviders(<ExaminationsView />, READER);
    expect((await screen.findAllByText('Semester 1 Examination')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Semester 1/).length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: /New examination/ })).not.toBeInTheDocument();
    view.unmount();
    mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<ExaminationsView />, EXAM_ADMIN);
    expect(await screen.findByRole('button', { name: /New examination/ })).toBeInTheDocument();
  });

  it('shows configured links as text and offers editing only to managers', async () => {
    const app = {
      id: '01900000-0000-7000-8000-0000000000a2',
      name: 'Synthetic Exam App',
      websiteUrl: 'https://exams.example.test',
      androidUrl: null,
      iosUrl: null,
      instructions: null,
      isActive: true,
      updatedAt: '2026-10-09T10:00:00.000Z',
      updatedBy: { id: '01900000-0000-7000-8000-0000000000aa', displayName: 'Exam Office' },
    };
    mockFetch(() => ({ body: { data: [app] } }));
    const view = renderWithProviders(<ExamAppView />, READER);
    expect(await screen.findByText('Active (shown to students)')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Edit|Add application/ })).not.toBeInTheDocument();
    view.unmount();
    renderWithProviders(<ExamAppView />, EXAM_ADMIN);
    expect(await screen.findByRole('button', { name: /Edit/ })).toBeInTheDocument();
  });
});
