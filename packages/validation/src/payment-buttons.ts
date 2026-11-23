import { z } from 'zod';

/** Public identifiers supplied by the mentor; these do not establish merchant ownership or mode. */
export const RAZORPAY_BUTTONS = {
  EXAM: { id: 'pl_TyWPTClJKY5RFa', label: 'Pay Exam Fee' },
  RE_EXAM: { id: 'pl_TyWTRF7DImX3Pu', label: 'Pay Re-Exam Fee' },
  CERTIFICATE_HARD_COPY: { id: 'pl_TyWXU0D8UbPlEC', label: 'Pay for Hard Copy Certificate' },
} as const;
/**
 * University fee schedule (mentor-supplied amounts, INR paise). Display and form defaults only:
 * it creates no obligation and enables no collection. Re-exam charges still come from the
 * activated, versioned re-exam fee rule, which staff create with this amount.
 */
export const FEE_SCHEDULE = {
  EXAM: { label: 'Examination Fee', amountMinor: 150_000 },
  RE_EXAM: { label: 'Re-examination Fee', amountMinor: 250_000 },
  CERTIFICATE_HARD_COPY: { label: 'Certificate Fee', amountMinor: 350_000 },
} as const;
export const FEE_CURRENCY = 'INR';
/** "₹3,500" (en-IN grouping, whole rupees). */
export function formatFee(amountMinor: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: FEE_CURRENCY,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
export const paymentButtonServiceSchema = z.enum(['EXAM', 'RE_EXAM', 'CERTIFICATE_HARD_COPY']);
export type PaymentButtonService = z.infer<typeof paymentButtonServiceSchema>;
export const PAYMENT_BUTTON_STATE_LABELS = {
  PENDING: 'Pending',
  AWAITING_VERIFICATION: 'Awaiting Verification',
  PAID: 'Paid',
  FAILED: 'Failed',
  UNAVAILABLE: 'Unavailable',
} as const;
export const paymentButtonViewSchema = z
  .object({
    service: paymentButtonServiceSchema,
    applicationId: z.uuid(),
    paymentId: z.uuid().nullable(),
    status: z.enum(['PENDING', 'AWAITING_VERIFICATION', 'PAID', 'FAILED', 'UNAVAILABLE']),
    unavailableReason: z.string().max(500).nullable(),
    certificateFeeScope: z.literal('HARD_COPY_ONLY'),
    // Only isolated test policies may return a test embed. No runtime flag enables live collection.
    checkout: z
      .object({
        mode: z.literal('TEST'),
        buttonId: z
          .string()
          .regex(/^pl_[A-Za-z0-9]{1,50}$/)
          .refine((id) => !Object.values(RAZORPAY_BUTTONS).some((button) => button.id === id)),
      })
      .strict()
      .nullable(),
    liveTransactionsEnabled: z.literal(false),
    qrFallbackEnabled: z.literal(false),
  })
  .strict();
export type PaymentButtonView = z.infer<typeof paymentButtonViewSchema>;
export const reconcileRazorpayPaymentSchema = z
  .object({
    receiptId: z.uuid(),
    paymentId: z.uuid(),
    buttonId: z.literal(RAZORPAY_BUTTONS.RE_EXAM.id),
    confirmedStudentOwnership: z.literal(true),
    confirmedAgainstProviderRecords: z.literal(true),
    // Private dashboard report reference, not a student's screenshot or self-reported notes.
    reportReference: z
      .string()
      .trim()
      .min(6)
      .max(128)
      .regex(/^[A-Za-z0-9 _./:-]+$/),
  })
  .strict();
export type ReconcileRazorpayPayment = z.infer<typeof reconcileRazorpayPaymentSchema>;
export const razorpayReceiptsSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id: z.uuid(),
            eventType: z.enum(['payment.captured', 'payment.failed']),
            amountMinor: z.number().int().positive(),
            currency: z.string().regex(/^[A-Z]{3}$/),
            captured: z.boolean(),
            amountRefunded: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(20),
    reconciliationAvailable: z.boolean(),
  })
  .strict();
export const razorpayReconciliationSchema = z
  .object({
    paymentId: z.uuid(),
    status: z.literal('PAID'),
    liveTransactionsEnabled: z.literal(false),
  })
  .strict();
export const razorpayWebhookResponseSchema = z
  .object({ received: z.literal(true), attributed: z.literal(false) })
  .strict();
