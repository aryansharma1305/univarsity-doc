import type { StatusTone } from '@docversity/ui';
import {
  PAYMENT_DESTINATION_STATE_LABELS,
  RE_EXAM_PAYMENT_STATUS_LABELS,
  type PaymentDestinationState,
  type ReExamPaymentStatus,
} from '@docversity/validation';

export const PAYMENT_STATUS: Record<ReExamPaymentStatus, { label: string; tone: StatusTone }> = {
  AWAITING_PAYMENT: { label: RE_EXAM_PAYMENT_STATUS_LABELS.AWAITING_PAYMENT, tone: 'neutral' },
  SUBMITTED: { label: RE_EXAM_PAYMENT_STATUS_LABELS.SUBMITTED, tone: 'warning' },
  VERIFIED: { label: RE_EXAM_PAYMENT_STATUS_LABELS.VERIFIED, tone: 'success' },
  REJECTED: { label: RE_EXAM_PAYMENT_STATUS_LABELS.REJECTED, tone: 'danger' },
  VOID: { label: RE_EXAM_PAYMENT_STATUS_LABELS.VOID, tone: 'neutral' },
};

export const PAYMENT_STATUS_OPTIONS = (Object.keys(PAYMENT_STATUS) as ReExamPaymentStatus[]).map(
  (value) => ({ value, label: PAYMENT_STATUS[value].label }),
);

export const DESTINATION_STATE: Record<
  PaymentDestinationState,
  { label: string; tone: StatusTone }
> = {
  DRAFT: { label: PAYMENT_DESTINATION_STATE_LABELS.DRAFT, tone: 'warning' },
  AVAILABLE: { label: PAYMENT_DESTINATION_STATE_LABELS.AVAILABLE, tone: 'success' },
  INACTIVE: { label: PAYMENT_DESTINATION_STATE_LABELS.INACTIVE, tone: 'neutral' },
  SCHEDULED: { label: PAYMENT_DESTINATION_STATE_LABELS.SCHEDULED, tone: 'neutral' },
  EXPIRED: { label: PAYMENT_DESTINATION_STATE_LABELS.EXPIRED, tone: 'danger' },
  RETIRED: { label: PAYMENT_DESTINATION_STATE_LABELS.RETIRED, tone: 'neutral' },
};
