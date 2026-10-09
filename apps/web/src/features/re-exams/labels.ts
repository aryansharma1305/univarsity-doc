import type { StatusTone } from '@docversity/ui';
import {
  type FeeSnapshot,
  formatMoney,
  RE_EXAM_FEE_BLOCKED_MESSAGES,
  RE_EXAM_FEE_SCOPE_LABELS,
  RE_EXAM_STATUS_LABELS,
  type ReExamApplicationStatus,
} from '@docversity/validation';

export const APPLICATION_STATUS: Record<
  ReExamApplicationStatus,
  { label: string; tone: StatusTone }
> = {
  SUBMITTED: { label: RE_EXAM_STATUS_LABELS.SUBMITTED, tone: 'warning' },
  APPROVED: { label: RE_EXAM_STATUS_LABELS.APPROVED, tone: 'success' },
  REJECTED: { label: RE_EXAM_STATUS_LABELS.REJECTED, tone: 'danger' },
  CANCELLED: { label: RE_EXAM_STATUS_LABELS.CANCELLED, tone: 'neutral' },
};

export const STATUS_OPTIONS = (Object.keys(APPLICATION_STATUS) as ReExamApplicationStatus[]).map(
  (value) => ({ value, label: APPLICATION_STATUS[value].label }),
);

/** "₹1,000.00 · Per subject (paper)" or the reason no fee could be assessed. */
export function feeText(
  fee: Pick<FeeSnapshot, 'status' | 'amountMinor' | 'currency' | 'scope' | 'blockedReason'>,
): string {
  if (fee.status === 'ASSESSED' && fee.amountMinor !== null && fee.currency) {
    return `${formatMoney(fee.amountMinor, fee.currency)}${fee.scope ? ` · ${RE_EXAM_FEE_SCOPE_LABELS[fee.scope]}` : ''}`;
  }
  return fee.blockedReason
    ? RE_EXAM_FEE_BLOCKED_MESSAGES[fee.blockedReason]
    : 'Fee not configured.';
}
