import { StatusBadge, type StatusTone } from '@docversity/ui';

const TONE: Record<string, StatusTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  UPCOMING: 'info',
  COMPLETED: 'info',
  ARCHIVED: 'neutral',
  SUSPENDED: 'warning',
  REVOKED: 'danger',
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  UPCOMING: 'Upcoming',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
  SUSPENDED: 'Suspended',
  REVOKED: 'Revoked',
};

export function RecordStatus({ status }: { status: string }) {
  return (
    <StatusBadge tone={TONE[status] ?? 'neutral'}>{STATUS_LABELS[status] ?? status}</StatusBadge>
  );
}
