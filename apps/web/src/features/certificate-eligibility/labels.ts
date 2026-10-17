import type { StatusTone } from '@docversity/ui';
import type {
  CertificateType,
  CourseConfigurationState,
  EligibilityConfigStatus,
  TypeEligibility,
  UnresolvedDurationReason,
} from '@docversity/validation';

export const CERTIFICATE_TITLES: Record<CertificateType, string> = {
  COURSE_COMPLETION: 'Course completion certificate',
  TRANSCRIPT: 'Transcript',
  PROVISIONAL: 'Provisional certificate',
  CHARACTER: 'Character certificate',
  MIGRATION: 'Migration certificate',
};

export const TYPE_ELIGIBILITY: Record<TypeEligibility, { label: string; tone: StatusTone }> = {
  APPROVED_FOR_COURSE: { label: 'Offered for this course', tone: 'success' },
  PENDING_COURSE_APPROVAL: { label: 'Pending course approval', tone: 'warning' },
  NOT_OFFERED_FOR_COURSE: { label: 'Not offered for this course', tone: 'neutral' },
  POLICY_UNRESOLVED: { label: 'University policy pending', tone: 'info' },
};

export const COURSE_CONFIGURATION: Record<
  CourseConfigurationState,
  { label: string; tone: StatusTone }
> = {
  APPROVED: { label: 'Approved certificate set', tone: 'success' },
  PENDING_APPROVAL: { label: 'Proposal awaiting approval', tone: 'warning' },
  NOT_CONFIGURED: { label: 'Not configured', tone: 'neutral' },
  OUT_OF_DATE: { label: 'Approval out of date', tone: 'danger' },
};

export const CONFIG_STATUS: Record<EligibilityConfigStatus, { label: string; tone: StatusTone }> = {
  PROPOSED: { label: 'Proposed', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral' },
};

export const UNRESOLVED_REASON: Record<UnresolvedDurationReason, string> = {
  MISSING_DURATION: 'This course has no recorded duration.',
  BELOW_TWO_MONTHS: 'Courses shorter than 2 months are not covered by the university policy yet.',
  FOUR_TO_FIVE_MONTHS: '4- and 5-month courses are not covered by the university policy yet.',
  SEVEN_TO_ELEVEN_MONTHS: '7- to 11-month courses are not covered by the university policy yet.',
  EXACTLY_TWELVE_MONTHS: '1-year (12-month) courses are not covered by the university policy yet.',
};

export function monthsLabel(months: number | null): string {
  if (months === null) return 'No duration recorded';
  if (months % 12 === 0)
    return `${months / 12} ${months === 12 ? 'year' : 'years'} (${months} months)`;
  return `${months} months`;
}
