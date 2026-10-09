// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  ReExamApplicationDetail,
  ReExamFeeRule,
  StudentReExamApplication,
  StudentReExamOptions,
} from '@docversity/validation';
import { exportPath } from '@/features/re-exams/api';
import { ReExamApplicationDetailView } from '@/features/re-exams/application-detail-view';
import { FeeRulesView } from '@/features/re-exams/fee-rules-view';
import { StudentReExamApply } from '@/features/student-portal/student-re-exam';
import { StudentReExamApplications } from '@/features/student-portal/student-re-exam-applications';
import { REGISTRAR, VIEWER, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/re-exam-applications',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const READER: AuthUser = {
  ...REGISTRAR,
  permissions: [...REGISTRAR.permissions, 'reExamApplications.read'],
};
const DECIDER: AuthUser = {
  ...READER,
  permissions: [...READER.permissions, 'reExamApplications.decide'],
};
const FINANCE: AuthUser = {
  ...VIEWER,
  permissions: [...VIEWER.permissions, 'reExamApplications.read', 'reExamFees.manage'],
};

const options: StudentReExamOptions = {
  registrations: [
    {
      registrationId: '01900000-0000-7000-8000-0000000000b1',
      studentName: 'Test Student One',
      registrationNumber: 'TEST-REG-1',
      program: { code: 'TP', name: 'Test Program' },
      academicSessionName: 'Session 2026',
      structureType: 'SEMESTER_WISE',
      unavailableReason: null,
      examinations: [
        {
          id: '01900000-0000-7000-8000-0000000000e1',
          name: 'Semester 2 Re-examination',
          examSession: 'Nov 2026',
          period: { number: 2, label: 'Semester 2' },
          subjects: [
            {
              programSubjectId: '01900000-0000-7000-8000-0000000000f1',
              code: 'SUB-1',
              name: 'Synthetic Anatomy',
              alreadyApplied: false,
              attemptNumber: 2,
              fee: {
                status: 'ASSESSED',
                blockedReason: null,
                amountMinor: 250_000,
                currency: 'INR',
                scope: 'PER_SUBJECT',
              },
            },
            {
              programSubjectId: '01900000-0000-7000-8000-0000000000f2',
              code: 'SUB-2',
              name: 'Synthetic Physiology',
              alreadyApplied: true,
              attemptNumber: 1,
              fee: {
                status: 'ASSESSED',
                blockedReason: null,
                amountMinor: 100_000,
                currency: 'INR',
                scope: 'PER_SUBJECT',
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('student re-exam form', () => {
  it('shows verified details read-only and previews the server attempt and fee', async () => {
    render(<StudentReExamApply options={options} />);
    expect(screen.getByText('Test Student One')).toBeInTheDocument();
    expect(screen.getByText('TEST-REG-1')).toBeInTheDocument();
    // Identity is never an editable field.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit application' });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Semester 2 Re-examination/ }));
    expect(
      screen.getByText(/Re-exam attempt 2 · Fee ₹2,500.00 \(per subject \(paper\)\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Synthetic Physiology/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Synthetic Anatomy/ }));
    expect(submit).toBeEnabled();
    expect(screen.getByText(/does not register you for the examination/)).toBeInTheDocument();
  });

  it('shows honest unavailable states', () => {
    const [first] = options.registrations;
    if (!first) throw new Error('fixture');
    const view = render(
      <StudentReExamApply options={{ registrations: [{ ...first, examinations: [] }] }} />,
    );
    expect(screen.getByText('No re-examination is open for applications')).toBeInTheDocument();
    view.rerender(<StudentReExamApply options={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

const application: StudentReExamApplication = {
  id: '01900000-0000-7000-8000-0000000000a1',
  reference: 'RX-0000-00A1',
  status: 'REJECTED',
  submittedAt: '2026-10-09T10:00:00.000Z',
  registrationNumber: 'TEST-REG-1',
  programName: 'Test Program',
  academicSessionName: 'Session 2026',
  periodLabel: 'Year 1',
  examinationName: 'Year 1 Re-examination',
  examSession: 'Nov 2026',
  subject: { code: 'SUB-1', name: 'Synthetic Anatomy' },
  attemptNumber: 3,
  fee: {
    status: 'NOT_CONFIGURED',
    blockedReason: 'NO_RATE_FOR_ATTEMPT',
    amountMinor: null,
    currency: null,
    scope: null,
    ruleVersion: null,
    assessedAt: null,
  },
  decidedAt: '2026-10-10T10:00:00.000Z',
  decisionReason: 'Synthetic: subject already passed',
  cancelledAt: null,
  history: [
    { summary: 'You submitted the application', createdAt: '2026-10-09T10:00:00.000Z' },
    { summary: 'Rejected by the university', createdAt: '2026-10-10T10:00:00.000Z' },
  ],
};

describe('student re-exam history', () => {
  it('shows fee blockers, the university’s reason and actions only while undecided', () => {
    const view = render(<StudentReExamApplications applications={[application]} />);
    const card = screen.getByRole('article', { name: 'Application RX-0000-00A1' });
    expect(
      within(card).getByText(
        'No fee has been approved for this attempt number. Payment cannot start.',
      ),
    ).toBeInTheDocument();
    expect(within(card).getByText('Synthetic: subject already passed')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    view.rerender(
      <StudentReExamApplications
        applications={[
          { ...application, status: 'SUBMITTED', decisionReason: null, decidedAt: null },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel application' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the fee again' })).toBeInTheDocument();
  });
});

describe('staff screens', () => {
  it('lists fee versions with exact amounts and no fee beyond the configured attempts', async () => {
    const rule: ReExamFeeRule = {
      id: '01900000-0000-7000-8000-0000000000c1',
      version: 1,
      status: 'ACTIVE',
      scope: 'PER_SUBJECT',
      currency: 'INR',
      attemptBasis: 'NON_REJECTED_RE_EXAM_APPLICATIONS',
      note: null,
      rates: [
        { attemptNumber: 1, amountMinor: 100_000 },
        { attemptNumber: 2, amountMinor: 250_000 },
      ],
      createdAt: '2026-10-09T10:00:00.000Z',
      createdBy: null,
      activatedAt: '2026-10-09T10:00:00.000Z',
      activatedBy: null,
      retiredAt: null,
      retiredBy: null,
    };
    mockFetch(() => ({ body: { data: [rule] } }));
    renderWithProviders(<FeeRulesView />, FINANCE);
    const fees = await screen.findByRole('list', { name: 'Fees of version 1' });
    expect(
      within(fees)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Attempt 1: ₹1,000.00', 'Attempt 2: ₹2,500.00', 'Attempt 3+: no approved fee']);
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
  });

  it('offers decisions only to staff with the decide permission', async () => {
    const detail: ReExamApplicationDetail = {
      id: '01900000-0000-7000-8000-0000000000a2',
      reference: 'RX-0000-00A2',
      status: 'SUBMITTED',
      submittedAt: '2026-10-09T10:00:00.000Z',
      decidedAt: null,
      student: { id: '01900000-0000-7000-8000-0000000000d1', name: 'Test Student One' },
      registrationId: '01900000-0000-7000-8000-0000000000b1',
      registrationNumber: 'TEST-REG-1',
      program: { code: 'TP', name: 'Test Program' },
      academicSessionName: 'Session 2026',
      periodLabel: 'Semester 2',
      examination: {
        id: '01900000-0000-7000-8000-0000000000e1',
        name: 'Re-exam',
        examSession: 'Nov 2026',
      },
      subject: { code: 'SUB-1', name: 'Synthetic Anatomy' },
      attemptNumber: 1,
      fee: {
        status: 'ASSESSED',
        blockedReason: null,
        amountMinor: 100_000,
        currency: 'INR',
        scope: 'PER_SUBJECT',
        ruleVersion: 1,
        assessedAt: '2026-10-09T10:00:00.000Z',
      },
      attemptBasis: 'NON_REJECTED_RE_EXAM_APPLICATIONS',
      decisionReason: null,
      decidedBy: null,
      cancelledAt: null,
      history: [],
    };
    mockFetch(() => ({ body: detail }));
    const view = renderWithProviders(
      <ReExamApplicationDetailView applicationId={detail.id} />,
      READER,
    );
    expect(await screen.findByText('₹1,000.00 · Per subject (paper)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    view.unmount();
    renderWithProviders(<ReExamApplicationDetailView applicationId={detail.id} />, DECIDER);
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
});

describe('re-exam CSV filters', () => {
  it('preserves filters, encodes search text and omits paging and unset values', () => {
    expect(exportPath({})).toBe('re-exam-applications/export');
    expect(
      exportPath({ page: 2, pageSize: 20, search: 'Test & Student', status: 'SUBMITTED' }),
    ).toBe('re-exam-applications/export?search=Test+%26+Student&status=SUBMITTED');
  });
});
