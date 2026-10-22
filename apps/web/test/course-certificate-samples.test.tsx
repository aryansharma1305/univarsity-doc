// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentRegistrationEligibilityV1 } from '@docversity/validation';
import { CourseCertificateSamples } from '@/features/student-portal/course-certificate-samples';

const TYPES = ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER', 'MIGRATION', 'COURSE_COMPLETION'] as const;
type Type = (typeof TYPES)[number];
const TEMPLATE: Record<Type, string> = {
  COURSE_COMPLETION: 'sample-course-completion',
  TRANSCRIPT: 'sample-transcript',
  PROVISIONAL: 'sample-provisional',
  CHARACTER: 'sample-character',
  MIGRATION: 'sample-migration',
};

function registration(
  id: string,
  name: string,
  months: number | null,
  eligibility: Partial<Record<Type, string>>,
  unresolvedReason: StudentRegistrationEligibilityV1['duration']['unresolvedReason'] = null,
): StudentRegistrationEligibilityV1 {
  return {
    registrationId: id,
    registrationNumber: `SAMPLE-REG-${id.slice(-4)}`,
    registrationStatus: 'ACTIVE',
    program: { code: `SAMPLE-${id.slice(-4)}`, name, durationMonths: months },
    duration: {
      outcome: unresolvedReason ? 'UNRESOLVED' : 'TIER',
      tier: unresolvedReason ? null : 'MORE_THAN_ONE_YEAR',
      unresolvedReason,
    },
    courseConfiguration: 'APPROVED',
    certificates: TYPES.map((certificateType) => {
      const typeEligibility = (eligibility[certificateType] ??
        (unresolvedReason
          ? 'POLICY_UNRESOLVED'
          : 'NOT_OFFERED_FOR_COURSE')) as StudentRegistrationEligibilityV1['certificates'][number]['typeEligibility'];
      const allowed = typeEligibility === 'APPROVED_FOR_COURSE';
      return {
        certificateType,
        typeEligibility,
        samplePreviewAllowed: allowed,
        samplePreviewTemplate: allowed
          ? { templateId: TEMPLATE[certificateType], version: 1 }
          : null,
        applicationAvailability: 'NOT_AVAILABLE',
        courseCompletionStatus: 'NOT_EVALUATED',
        paymentVerification: 'NOT_AVAILABLE',
        rectorApproval: 'NOT_AVAILABLE',
        issuance: 'NOT_AVAILABLE',
      };
    }),
  };
}
const R1 = '0199e3a4-7a1b-7c4d-8e2f-000000000301';
const R2 = '0199e3a4-7a1b-7c4d-8e2f-000000000302';
const R3 = '0199e3a4-7a1b-7c4d-8e2f-000000000303';
const shortCourse = registration(R1, 'Synthetic short course', 3, {
  COURSE_COMPLETION: 'APPROVED_FOR_COURSE',
});
const degree = registration(R2, 'Synthetic degree', 36, {
  TRANSCRIPT: 'APPROVED_FOR_COURSE',
  PROVISIONAL: 'APPROVED_FOR_COURSE',
  CHARACTER: 'APPROVED_FOR_COURSE',
  MIGRATION: 'APPROVED_FOR_COURSE',
});
const pending = registration(R3, 'Synthetic diploma', 18, {
  TRANSCRIPT: 'PENDING_COURSE_APPROVAL',
  PROVISIONAL: 'PENDING_COURSE_APPROVAL',
  CHARACTER: 'PENDING_COURSE_APPROVAL',
});
const sampleLinks = () => screen.queryAllByRole('link');

describe('course certificate samples', () => {
  it('shows a single registration directly, with links only for approved types', () => {
    render(<CourseCertificateSamples registrations={[shortCourse]} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Synthetic short course')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Preview Course Completion Certificate sample (opens in a new tab)',
      }),
    ).toHaveAttribute(
      'href',
      `/api/v1/student/certificate-samples/registrations/${R1}/sample-course-completion-v1/file?disposition=inline`,
    );
    expect(
      screen.getByRole('link', { name: 'Download Course Completion Certificate sample PDF' }),
    ).toHaveAttribute(
      'href',
      `/api/v1/student/certificate-samples/registrations/${R1}/sample-course-completion-v1/file?disposition=attachment`,
    );
    expect(sampleLinks()).toHaveLength(2);
    expect(
      screen.getByText(
        /Not offered for this course: Transcript, Provisional Certificate, Character Certificate, Migration Certificate/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not mean you have completed the course, qualified, paid, or received/),
    ).toBeInTheDocument();
  });

  it('never preselects among several registrations and follows the student’s choice', () => {
    const { container } = render(
      <CourseCertificateSamples registrations={[shortCourse, degree, pending]} />,
    );
    const select = screen.getByRole('combobox', { name: 'Choose a course' });
    expect(select).toHaveValue('');
    expect(sampleLinks()).toHaveLength(0);
    expect(
      screen.getByText('You have 3 courses. Choose one to see its certificate samples.'),
    ).toBeInTheDocument();
    fireEvent.change(select, { target: { value: R2 } });
    expect(sampleLinks()).toHaveLength(8);
    for (const link of sampleLinks())
      expect(link.getAttribute('href')).toContain(`/registrations/${R2}/`);
    expect(
      screen.getByRole('link', { name: /Preview Migration Certificate sample/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Course Completion/ })).toBeNull();
    fireEvent.change(select, { target: { value: R1 } });
    expect(sampleLinks()).toHaveLength(2);
    expect(container.querySelectorAll('article')).toHaveLength(0);
  });

  it('shows pending types with an explanation and no sample', () => {
    render(<CourseCertificateSamples registrations={[pending]} />);
    const list = screen.getByRole('list', { name: 'Certificates for Synthetic diploma' });
    expect(within(list).getAllByText('Not currently approved for this course')).toHaveLength(3);
    expect(screen.queryByText(/Awaiting/)).toBeNull();
    expect(sampleLinks()).toHaveLength(0);
    expect(
      screen.getByText(/Samples are shown only for certificate types currently approved/),
    ).toBeInTheDocument();
  });

  it('explains unresolved durations and offers nothing', () => {
    render(
      <CourseCertificateSamples
        registrations={[
          registration(R3, 'Synthetic one-year course', 12, {}, 'EXACTLY_TWELVE_MONTHS'),
        ]}
      />,
    );
    expect(screen.getByRole('note').textContent).toMatch(
      /1-year courses offer\. No academic samples are available for it yet\./,
    );
    expect(
      screen.getByText(/Certificate availability for this course has not been confirmed yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Certificate types for this course/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/offers for this course/);
    expect(screen.queryByRole('list')).toBeNull();
    expect(sampleLinks()).toHaveLength(0);
  });

  it('distinguishes unavailable data from having no registrations', () => {
    const { rerender } = render(<CourseCertificateSamples registrations={null} />);
    expect(screen.getByRole('status').textContent).toMatch(/could not be loaded/);
    rerender(<CourseCertificateSamples registrations={[]} />);
    expect(
      screen.getByText('No course registrations were found for your account.'),
    ).toBeInTheDocument();
    expect(sampleLinks()).toHaveLength(0);
  });
});
