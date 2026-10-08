import type { StatusTone } from '@docversity/ui';
import type { PortalState } from '@docversity/validation';

export const PORTAL_STATE: Record<PortalState, { label: string; tone: StatusTone }> = {
  NO_ACCOUNT: { label: 'Not activated', tone: 'neutral' },
  CODE_ISSUED: { label: 'Code issued', tone: 'info' },
  CODE_EXPIRED: { label: 'Code expired', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'success' },
  LOCKED: { label: 'Locked', tone: 'warning' },
  DISABLED: { label: 'Disabled', tone: 'danger' },
};

export const PORTAL_STATE_OPTIONS = (Object.keys(PORTAL_STATE) as PortalState[]).map((value) => ({
  value,
  label: PORTAL_STATE[value].label,
}));
