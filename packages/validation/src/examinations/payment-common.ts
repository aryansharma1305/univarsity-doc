import { z } from 'zod';

/**
 * Payment vocabulary shared by re-exam applications (Phase 9B) and payments (Phase 9C).
 */

// ----------------------------------------------------------------------------------------------
// Regions
// ----------------------------------------------------------------------------------------------

export const PAYMENT_REGIONS = [
  'INDIA',
  'NEPAL',
  'BANGLADESH',
  'PAKISTAN',
  'AFGHANISTAN',
  'EUROPE',
  'CENTRAL_ASIA',
  'OTHERS',
] as const;
export const paymentRegionSchema = z.enum(PAYMENT_REGIONS);
export type PaymentRegion = z.infer<typeof paymentRegionSchema>;

export const PAYMENT_REGION_LABELS: Record<PaymentRegion, string> = {
  INDIA: 'India',
  NEPAL: 'Nepal',
  BANGLADESH: 'Bangladesh',
  PAKISTAN: 'Pakistan',
  AFGHANISTAN: 'Afghanistan',
  EUROPE: 'Europe',
  CENTRAL_ASIA: 'Central Asia',
  OTHERS: 'Others',
};

/** Region groups (several countries) — the others are single countries. */
export const PAYMENT_REGION_GROUPS: readonly PaymentRegion[] = ['EUROPE', 'CENTRAL_ASIA', 'OTHERS'];
export const isRegionGroup = (region: PaymentRegion) => PAYMENT_REGION_GROUPS.includes(region);

export const RE_EXAM_PAYMENT_STATUSES = [
  'AWAITING_PAYMENT',
  'SUBMITTED',
  'VERIFIED',
  'REJECTED',
  'VOID',
] as const;
export const reExamPaymentStatusSchema = z.enum(RE_EXAM_PAYMENT_STATUSES);
export type ReExamPaymentStatus = z.infer<typeof reExamPaymentStatusSchema>;
export const RE_EXAM_PAYMENT_STATUS_LABELS: Record<ReExamPaymentStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  SUBMITTED: 'Submitted — awaiting verification',
  VERIFIED: 'Verified by the university',
  REJECTED: 'Not verified',
  VOID: 'Replaced (another country/region chosen)',
};

/** Compact payment state shown with an application (staff and student). */
export const reExamPaymentSummarySchema = z
  .object({
    id: z.uuid(),
    status: reExamPaymentStatusSchema,
    region: paymentRegionSchema,
    amountMinor: z.number().int(),
    currency: z.string(),
    submittedAt: z.iso.datetime().nullable(),
    reviewedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'ReExamPaymentSummary' });

export type ReExamPaymentSummary = z.infer<typeof reExamPaymentSummarySchema>;
