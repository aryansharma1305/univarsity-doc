// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, CurriculumDetail, Program, StudentMe } from '@docversity/validation';
import { CurriculumEditorView } from '@/features/curricula/curriculum-editor-view';
import { ProgramDialog } from '@/features/programs/program-dialog';
import { StudentCourses } from '@/features/student-portal/student-pages';
import { SubjectsView } from '@/features/subjects/subjects-view';
import { EMPTY_PAGE, REGISTRAR, VIEWER, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/programs',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const CURRICULUM_ADMIN: AuthUser = {
  ...REGISTRAR,
  permissions: [
    ...REGISTRAR.permissions,
    'subjects.read',
    'subjects.write',
    'curricula.read',
    'curricula.write',
    'curricula.activate',
    'curricula.archive',
    'studentCurricula.assign',
  ],
};
const READER: AuthUser = {
  ...VIEWER,
  permissions: [...VIEWER.permissions, 'subjects.read', 'curricula.read'],
};

const program: Program = {
  id: '01900000-0000-7000-8000-000000000010',
  code: 'SYN-CERT',
  name: 'Synthetic Certificate',
  level: 'CERTIFICATE',
  description: null,
  durationValue: 1,
  durationUnit: 'YEARS',
  academicStructure: 'SEMESTER_WISE',
  periodCount: 2,
  durationSemesters: 2,
  department: null,
  status: 'ACTIVE',
  registrationCount: 0,
  curriculumCount: 1,
  createdAt: '2026-10-09T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
};

function curriculum(status: CurriculumDetail['status']): CurriculumDetail {
  return {
    id: '01900000-0000-7000-8000-000000000020',
    programId: program.id,
    program: { id: program.id, code: program.code, name: program.name, status: 'ACTIVE' },
    versionCode: '2026',
    name: '2026 syllabus',
    description: null,
    structureType: 'SEMESTER_WISE',
    numberOfPeriods: 2,
    effectiveFrom: null,
    effectiveTo: null,
    status,
    subjectCount: 1,
    registrationCount: 0,
    activatedAt: status === 'DRAFT' ? null : '2026-10-09T00:00:00.000Z',
    activatedBy: null,
    archivedAt: null,
    archivedBy: null,
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
    periods: [
      {
        number: 1,
        label: 'Semester 1',
        subjects: [
          {
            id: '01900000-0000-7000-8000-000000000030',
            subject: {
              id: '01900000-0000-7000-8000-000000000040',
              code: 'SYN-101',
              name: 'Synthetic Physics',
              category: 'THEORY',
              status: 'ACTIVE',
            },
            periodNumber: 1,
            displayOrder: 0,
            classification: 'THEORY',
            credits: 4,
            maxMarks: 100,
            passMarks: 40,
            components: [
              { name: 'Internal', maxMarks: 40, passMarks: null },
              { name: 'External', maxMarks: 60, passMarks: null },
            ],
          },
        ],
      },
      { number: 2, label: 'Semester 2', subjects: [] },
    ],
  };
}

function serveCurriculum(detail: CurriculumDetail) {
  return mockFetch((_method, path) => {
    if (path.startsWith('curricula/')) return { body: detail };
    if (path.startsWith('programs/')) return { body: program };
    return { body: EMPTY_PAGE };
  });
}

describe('course form', () => {
  it('labels the period count by structure and requires complete structure pairs', async () => {
    const fetchMock = mockFetch(() => ({ body: program }));
    renderWithProviders(<ProgramDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Number of semesters/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Course name/), 'Synthetic Course');
    await userEvent.type(screen.getByLabelText(/Course code/), 'SYN-1');
    await userEvent.type(screen.getByLabelText(/Number of semesters/), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Create course' }));
    expect(await screen.findByText('Choose semester-wise or year-wise.')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes(
          '/programs',
        ),
      ),
    ).toBe(false);
  });
});

describe('curriculum editor', () => {
  it('offers editing and activation on a draft, with semester tabs', async () => {
    serveCurriculum(curriculum('DRAFT'));
    renderWithProviders(
      <CurriculumEditorView programId={program.id} curriculumId={curriculum('DRAFT').id} />,
      CURRICULUM_ADMIN,
    );
    expect(
      await screen.findByRole('heading', { name: '2026 · 2026 syllabus' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Semester 1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Semester 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate curriculum' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add subject' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit SYN-101' }).length).toBeGreaterThan(0);
    const table = screen.getByRole('table', { name: 'Subjects in Semester 1' });
    expect(within(table).getByText('Internal 40 · External 60')).toBeInTheDocument();
  });

  it('is read-only once active, and for read-only staff', async () => {
    serveCurriculum(curriculum('ACTIVE'));
    const view = renderWithProviders(
      <CurriculumEditorView programId={program.id} curriculumId={curriculum('ACTIVE').id} />,
      CURRICULUM_ADMIN,
    );
    expect(await screen.findByText(/Read-only: this version is active/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add subject' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit SYN-101/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate curriculum' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    view.unmount();

    serveCurriculum(curriculum('DRAFT'));
    renderWithProviders(
      <CurriculumEditorView programId={program.id} curriculumId={curriculum('DRAFT').id} />,
      READER,
    );
    expect(
      await screen.findByRole('heading', { name: '2026 · 2026 syllabus' }),
    ).toBeInTheDocument();
    for (const name of ['Add subject', 'Activate curriculum', 'Archive', 'Edit details']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('checks that assessment components add up before saving', async () => {
    const detail = curriculum('DRAFT');
    const calls: string[] = [];
    mockFetch((method, path) => {
      if (method !== 'GET') calls.push(`${method} ${path}`);
      if (path.startsWith('curricula/')) return { body: detail };
      if (path.startsWith('programs/')) return { body: program };
      return { body: EMPTY_PAGE };
    });
    renderWithProviders(
      <CurriculumEditorView programId={program.id} curriculumId={detail.id} />,
      CURRICULUM_ADMIN,
    );
    const editButton = (await screen.findAllByRole('button', { name: 'Edit SYN-101' }))[0];
    if (!editButton) throw new Error('Expected a subject edit button');
    await userEvent.click(editButton);
    const dialog = await screen.findByRole('dialog');
    const max = within(dialog).getByLabelText(/Maximum marks/);
    await userEvent.clear(max);
    await userEvent.type(max, '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(
      await within(dialog).findByText(/components add up to 100, but maximum marks are 120/),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});

describe('subject catalogue', () => {
  it('shows catalogue failure with retry rather than suggesting a new subject', async () => {
    const detail = curriculum('DRAFT');
    let recovered = false;
    mockFetch((_method, path) => {
      if (path.startsWith('curricula/')) return { body: detail };
      if (path.startsWith('programs/')) return { body: program };
      if (path.startsWith('subjects') && !recovered)
        return {
          status: 503,
          body: {
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable', requestId: 'test' },
          },
        };
      return { body: EMPTY_PAGE };
    });
    renderWithProviders(
      <CurriculumEditorView programId={program.id} curriculumId={detail.id} />,
      CURRICULUM_ADMIN,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add subject' }));
    expect(
      await screen.findByText('The subject catalogue could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No active subject matches/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create a new subject/ })).not.toBeInTheDocument();
    recovered = true;
    await userEvent.click(screen.getByRole('button', { name: 'Retry catalogue' }));
    expect(await screen.findByText(/No active subject matches/)).toBeInTheDocument();
  });

  it('lets read-only staff browse but not add subjects', async () => {
    mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<SubjectsView />, READER);
    expect(await screen.findByText('No subjects yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add subject' })).not.toBeInTheDocument();
  });
});

describe('student course details', () => {
  const me: StudentMe = {
    account: {
      id: '01900000-0000-7000-8000-000000000001',
      status: 'ACTIVE',
      activatedAt: '2026-10-09T09:30:00.000Z',
    },
    student: {
      id: '01900000-0000-7000-8000-000000000002',
      fullName: 'Test Student One',
      fatherName: null,
      motherName: null,
      dateOfBirth: null,
      gender: null,
      hasPhoto: false,
    },
    registrations: [
      {
        id: '01900000-0000-7000-8000-000000000003',
        registrationNumber: 'TEST-REG-1',
        rollReferenceNumber: null,
        program: { id: program.id, code: program.code, name: program.name },
        department: null,
        academicSession: { id: '01900000-0000-7000-8000-000000000005', code: 'S', name: 'Session' },
        admissionDate: null,
        completionDate: null,
        status: 'ACTIVE',
      },
    ],
  };
  const registrationId = me.registrations[0]?.id ?? '';
  const ref = { id: program.id, code: program.code, name: program.name };

  it('shows the assigned curriculum by semester, or says it is not assigned yet', () => {
    const view = render(
      <StudentCourses
        me={me}
        curricula={{
          registrations: [
            {
              registrationId,
              registrationNumber: 'TEST-REG-1',
              program: ref,
              curriculum: {
                versionCode: '2026',
                name: '2026 syllabus',
                structureType: 'YEAR_WISE',
                numberOfPeriods: 1,
                status: 'ACTIVE',
                periods: [
                  {
                    number: 1,
                    label: 'Year 1',
                    subjects: [
                      {
                        code: 'SYN-101',
                        name: 'Synthetic Physics',
                        classification: 'THEORY',
                        credits: 4,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Curriculum: 2026 syllabus (2026)')).toBeInTheDocument();
    expect(screen.getByText('Year 1')).toBeInTheDocument();
    expect(screen.getByText('Theory · 4 credits')).toBeInTheDocument();
    view.rerender(
      <StudentCourses
        me={me}
        curricula={{
          registrations: [
            { registrationId, registrationNumber: 'TEST-REG-1', program: ref, curriculum: null },
          ],
        }}
      />,
    );
    expect(screen.getByText('Curriculum not assigned yet')).toBeInTheDocument();
    expect(screen.queryByText(/Progress|Grade|Next exam/)).not.toBeInTheDocument();
  });

  it('shows unavailable curriculum separately from an unassigned version', async () => {
    render(<StudentCourses me={me} curricula={null} />);
    await waitFor(() => {
      expect(screen.getByText('Curriculum temporarily unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Curriculum not assigned yet')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reload course details' })).toHaveAttribute(
        'href',
        '/student/course',
      );
    });
  });
});
