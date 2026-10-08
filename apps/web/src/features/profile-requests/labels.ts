import type { StatusTone } from '@docversity/ui';
import type { ProfileRequestStatus } from '@docversity/validation';

export const PROFILE_REQUEST_STATUS: Record<
  ProfileRequestStatus,
  { label: string; tone: StatusTone }
> = {
  PENDING: { label: 'Pending review', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const PROFILE_REQUEST_STATUS_OPTIONS = (
  Object.keys(PROFILE_REQUEST_STATUS) as ProfileRequestStatus[]
).map((value) => ({ value, label: PROFILE_REQUEST_STATUS[value].label }));
