import { z } from 'zod';

/** Public identifiers supplied by the mentor; these do not establish merchant ownership or mode. */
export const RAZORPAY_BUTTONS = {
  EXAM: { id: 'pl_TyWPTClJKY5RFa', label: 'Pay Exam Fee' },
  RE_EXAM: { id: 'pl_TyWTRF7DImX3Pu', label: 'Pay Re-Exam Fee' },
  CERTIFICATE_HARD_COPY: { id: 'pl_TyWXU0D8UbPlEC', label: 'Pay for Hard Copy Certificate' },
} as const;
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
