// @vitest-environment jsdom
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  describeCertificateDurationPolicy,
  type ProgramCertificateEligibility,
  type StudentCertificateEligibilityV1,
} from '@docversity/validation';

const mocks = vi.hoisted(() => ({
  can: vi.fn(),
  program: vi.fn(),
  propose: vi.fn(),
  decide: vi.fn(),
  student: vi.fn(),
}));
vi.mock('@/components/providers/session-context', () => ({ useCan: mocks.can }));
vi.mock('@/features/certificate-eligibility/api', async () => {
  const { useQuery } = await import('@tanstack/react-query');
  const programEligibilityKey = (programId: string, durationKey: string) =>
    ['certificate-eligibility', 'program', programId, durationKey] as const;
  return {
    certificateEligibilityApi: mocks,
    programEligibilityKey,
    useProgramCertificateEligibility: (programId: string, durationKey: string, enabled: boolean) =>
      useQuery({
        queryKey: programEligibilityKey(programId, durationKey),
        queryFn: () => mocks.program(programId) as Promise<ProgramCertificateEligibility>,
        enabled,
      }),
  };
});
import { CourseCertificateEligibilityPanel } from '@/features/certificate-eligibility/course-panel';
import { StudentCertificateEligibility } from '@/features/certificate-eligibility/student-panel';

function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
const PROGRAM = '0199e3a4-7a1b-7c4d-8e2f-123456789abc';
const USER = '0199e3a4-7a1b-7c4d-8e2f-000000000001';
function courseView(
  over: Partial<ProgramCertificateEligibility> = {},
): ProgramCertificateEligibility {
  return {
    program: {
      id: PROGRAM,
      code: 'SYN-18',
      name: 'Synthetic',
      durationValue: 18,
      durationUnit: 'MONTHS',
    },
    policy: describeCertificateDurationPolicy(),
    evaluation: {
      outcome: 'TIER',
      policyId: 'UNIVERSITY_COURSE_DURATION_CERTIFICATES',
      policyVersion: 1,
      durationMonths: 18,
      tier: 'MORE_THAN_ONE_YEAR',
      unresolvedReason: null,
      permittedTypes: ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER'],
    },
    configuration: 'NOT_CONFIGURED',
    approved: null,
    pending: null,
    history: [],
    types: [
      { certificateType: 'TRANSCRIPT', eligibility: 'PENDING_COURSE_APPROVAL' },
      { certificateType: 'PROVISIONAL', eligibility: 'PENDING_COURSE_APPROVAL' },
      { certificateType: 'CHARACTER', eligibility: 'PENDING_COURSE_APPROVAL' },
      { certificateType: 'MIGRATION', eligibility: 'NOT_OFFERED_FOR_COURSE' },
      { certificateType: 'COURSE_COMPLETION', eligibility: 'NOT_OFFERED_FOR_COURSE' },
    ],
    approval: { enabled: false, reason: 'Approval is disabled: no approver authorized.' },
    canPropose: true,
    canWithdraw: false,
    canDecide: false,
    boundaries: ['Not Rector approval.'],
    ...over,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
});

it('offers only the policy-permitted types and reviews a proposal before submitting', async () => {
  mocks.program.mockResolvedValue(courseView());
  mocks.propose.mockResolvedValue(courseView({ canPropose: false }));
  mount(<CourseCertificateEligibilityPanel programId={PROGRAM} durationKey="18MONTHS" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Propose certificate set' }));
  const form = screen.getByRole('form', { name: 'Propose a certificate set' });
  const boxes = within(form).getAllByRole('checkbox');
  expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual([
    'Transcript',
    'Provisional certificate',
    'Character certificate',
  ]);
  const first = boxes[0];
  if (!first) throw new Error('Missing checkbox');
  fireEvent.click(first);
  fireEvent.change(within(form).getByLabelText(/University authority reference/), {
    target: { value: 'Synthetic council decision' },
  });
  fireEvent.click(within(form).getByRole('button', { name: 'Review proposal' }));
  expect(mocks.propose).not.toHaveBeenCalled();
  expect(within(form).getByRole('status').textContent).toMatch(/different, authorized person/);
  fireEvent.click(within(form).getByRole('button', { name: 'Submit proposal' }));
  await waitFor(() => {
    expect(mocks.propose).toHaveBeenCalledWith(PROGRAM, {
      certificateTypes: ['TRANSCRIPT'],
      authorityReference: 'Synthetic council decision',
    });
  });
});

it('shows unresolved durations without a proposal action', async () => {
  mocks.program.mockResolvedValue(
    courseView({
      evaluation: {
        outcome: 'UNRESOLVED',
        policyId: 'UNIVERSITY_COURSE_DURATION_CERTIFICATES',
        policyVersion: 1,
        durationMonths: 12,
        tier: null,
        unresolvedReason: 'EXACTLY_TWELVE_MONTHS',
        permittedTypes: [],
      },
      canPropose: false,
      types: courseView().types.map((t) => ({ ...t, eligibility: 'POLICY_UNRESOLVED' })),
    }),
  );
  mount(<CourseCertificateEligibilityPanel programId={PROGRAM} durationKey="1YEARS" />);
  expect(await screen.findByText(/1-year \(12-month\) courses are not covered/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Propose certificate set' })).toBeNull();
  expect(screen.getAllByText('University policy pending')).toHaveLength(5);
});

it('keeps approval disabled with the server reason and hides the panel without permission', async () => {
  const pending = {
    id: '0199e3a4-7a1b-7c4d-8e2f-0000000000aa',
    programId: PROGRAM,
    revision: 1,
    version: 1,
    status: 'PROPOSED' as const,
    certificateTypes: ['TRANSCRIPT' as const],
    policyId: 'UNIVERSITY_COURSE_DURATION_CERTIFICATES' as const,
    policyVersion: 1,
    durationMonths: 18,
    tier: 'MORE_THAN_ONE_YEAR' as const,
    authorityReference: 'Synthetic',
    rationale: null,
    proposedBy: { id: USER, displayName: 'Synthetic registrar' },
    proposedAt: '2026-10-17T00:00:00.000Z',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    matchesCurrentCourse: true,
  };
  mocks.program.mockResolvedValue(
    courseView({
      pending,
      configuration: 'PENDING_APPROVAL',
      canPropose: false,
      canWithdraw: true,
    }),
  );
  const view = mount(
    <CourseCertificateEligibilityPanel programId={PROGRAM} durationKey="18MONTHS" />,
  );
  const approve = await screen.findByRole('button', { name: 'Approve set' });
  expect((approve as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Approval is disabled: no approver authorized.')).toBeTruthy();
  view.unmount();
  mocks.can.mockReturnValue(false);
  mount(<CourseCertificateEligibilityPanel programId={PROGRAM} durationKey="18MONTHS" />);
  expect(screen.queryByRole('heading', { name: 'Certificate eligibility' })).toBeNull();
  expect(mocks.program).toHaveBeenCalledTimes(1);
});

function item(certificateType: string, typeEligibility: string) {
  const allowed = typeEligibility === 'APPROVED_FOR_COURSE';
  return {
    certificateType,
    typeEligibility,
    samplePreviewAllowed: allowed,
    samplePreviewTemplate: allowed ? { templateId: 'sample-x', version: 1 } : null,
    applicationAvailability: 'NOT_AVAILABLE',
    courseCompletionStatus: 'NOT_EVALUATED',
    paymentVerification: 'NOT_AVAILABLE',
    rectorApproval: 'NOT_AVAILABLE',
    issuance: 'NOT_AVAILABLE',
  };
}
it('shows each registration separately and keeps every downstream stage distinct', async () => {
  const data = {
    contract: 'docversity.student-certificate-eligibility',
    contractVersion: 1,
    policy: { id: 'UNIVERSITY_COURSE_DURATION_CERTIFICATES', version: 1 },
    registrations: [
      {
        registrationId: PROGRAM,
        registrationNumber: 'SAMPLE-REG-0001',
        registrationStatus: 'ACTIVE',
        program: { code: 'S3', name: 'Synthetic short course', durationMonths: 3 },
        duration: { outcome: 'TIER', tier: 'SHORT_COURSE', unresolvedReason: null },
        courseConfiguration: 'APPROVED',
        certificates: [
          item('TRANSCRIPT', 'NOT_OFFERED_FOR_COURSE'),
          item('PROVISIONAL', 'NOT_OFFERED_FOR_COURSE'),
          item('CHARACTER', 'NOT_OFFERED_FOR_COURSE'),
          item('MIGRATION', 'NOT_OFFERED_FOR_COURSE'),
          item('COURSE_COMPLETION', 'APPROVED_FOR_COURSE'),
        ],
      },
      {
        registrationId: USER,
        registrationNumber: 'SAMPLE-REG-0002',
        registrationStatus: 'ACTIVE',
        program: { code: 'S12', name: 'Synthetic one-year course', durationMonths: 12 },
        duration: { outcome: 'UNRESOLVED', tier: null, unresolvedReason: 'EXACTLY_TWELVE_MONTHS' },
        courseConfiguration: 'NOT_CONFIGURED',
        certificates: [
          'TRANSCRIPT',
          'PROVISIONAL',
          'CHARACTER',
          'MIGRATION',
          'COURSE_COMPLETION',
        ].map((t) => item(t, 'POLICY_UNRESOLVED')),
      },
    ],
  } as StudentCertificateEligibilityV1;
  mocks.student.mockResolvedValue(data);
  mount(<StudentCertificateEligibility />);
  const short = await screen.findByRole('article', { name: 'Synthetic short course' });
  expect(within(short).getByText('Offered for this course')).toBeTruthy();
  expect(within(short).getAllByText('Not offered for this course')).toHaveLength(4);
  expect(
    within(short).getByText(
      /Application, payment verification, Rector approval and issuance are not available yet\. Course completion is not evaluated\./,
    ),
  ).toBeTruthy();
  const year = screen.getByRole('article', { name: 'Synthetic one-year course' });
  expect(within(year).getAllByText('University policy pending')).toHaveLength(5);
  expect(within(year).queryByText(/Rector approval/)).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('lists each later stage separately once any of them differs', async () => {
  const available = {
    ...item('TRANSCRIPT', 'APPROVED_FOR_COURSE'),
    applicationAvailability: 'AVAILABLE',
  };
  mocks.student.mockResolvedValue({
    contract: 'docversity.student-certificate-eligibility',
    contractVersion: 1,
    policy: { id: 'UNIVERSITY_COURSE_DURATION_CERTIFICATES', version: 1 },
    registrations: [
      {
        registrationId: PROGRAM,
        registrationNumber: 'SAMPLE-REG-0001',
        registrationStatus: 'ACTIVE',
        program: { code: 'S18', name: 'Synthetic diploma', durationMonths: 18 },
        duration: { outcome: 'TIER', tier: 'MORE_THAN_ONE_YEAR', unresolvedReason: null },
        courseConfiguration: 'APPROVED',
        certificates: [
          available,
          item('PROVISIONAL', 'NOT_OFFERED_FOR_COURSE'),
          item('CHARACTER', 'NOT_OFFERED_FOR_COURSE'),
          item('MIGRATION', 'NOT_OFFERED_FOR_COURSE'),
          item('COURSE_COMPLETION', 'NOT_OFFERED_FOR_COURSE'),
        ],
      },
    ],
  });
  mount(<StudentCertificateEligibility />);
  const card = await screen.findByRole('article', { name: 'Synthetic diploma' });
  const terms = within(card)
    .getAllByRole('term')
    .map((t) => t.textContent);
  expect(terms).toEqual([
    'Application',
    'Course completion',
    'Payment verification',
    'Rector approval',
    'Issuance',
  ]);
  expect(within(card).getByText('Available')).toBeTruthy();
  expect(within(card).getAllByText('Not available yet')).toHaveLength(3);
});
