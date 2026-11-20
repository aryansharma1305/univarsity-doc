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
      .union([
        z
          .object({
            mode: z.literal('TEST'),
            buttonId: z
              .string()
              .regex(/^pl_[A-Za-z0-9]{1,50}$/)
              .refine((id) => !Object.values(RAZORPAY_BUTTONS).some((button) => button.id === id)),
          })
          .strict(),
        // Orders API Standard Checkout: the server creates the order; the browser gets no amount here.
        z.object({ mode: z.literal('TEST'), kind: z.literal('ORDER') }).strict(),
      ])
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

/** Test-mode Orders API checkout for a re-exam obligation (key id only; never a secret or PII). */
export const razorpayOrderViewSchema = z
  .object({
    orderId: z.string().regex(/^order_[A-Za-z0-9]{1,50}$/),
    keyId: z.string().regex(/^rzp_test_[A-Za-z0-9]{8,32}$/),
    amountMinor: z.number().int().min(100),
    currency: z.string().regex(/^[A-Z]{3}$/),
    mode: z.literal('TEST'),
  })
  .strict();
export type RazorpayOrderView = z.infer<typeof razorpayOrderViewSchema>;
/** Values Standard Checkout passes to the browser handler after a payment attempt. */
export const razorpayCheckoutReturnSchema = z
  .object({
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{1,50}$/),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{1,50}$/),
    razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RazorpayCheckoutReturn = z.infer<typeof razorpayCheckoutReturnSchema>;
/** The browser return never marks a payment paid; only the signed webhook does. */
export const razorpayCheckoutReturnResultSchema = z
  .object({ status: z.literal('AWAITING_CONFIRMATION') })
  .strict();

/** Staff refund request for a PAID Razorpay test order. Amount omitted: the full remaining amount. */
export const requestRazorpayRefundSchema = z
  .object({
    amountMinor: z.number().int().min(1).max(1_000_000_000).optional(),
    // Reason code only (the university's reason catalogue is an open decision, plan D4).
    reason: z.string().regex(/^[A-Z][A-Z_]{2,47}$/),
  })
  .strict();
export type RequestRazorpayRefund = z.infer<typeof requestRazorpayRefundSchema>;

const refundStatusSchema = z.enum([
  'REQUESTED',
  'APPROVED',
  'PENDING',
  'PROCESSED',
  'FAILED',
  'REJECTED',
]);
const staffNameSchema = z.object({ id: z.uuid(), name: z.string() }).nullable();
export const razorpayRefundViewSchema = z
  .object({
    id: z.uuid(),
    amountMinor: z.number().int(),
    currency: z.string(),
    reason: z.string(),
    status: refundStatusSchema,
    providerRefundId: z.string().nullable(),
    failureReason: z.string().nullable(),
    requestedBy: staffNameSchema,
    approvedBy: staffNameSchema,
    createdAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    events: z.array(z.object({ kind: z.string(), createdAt: z.iso.datetime() })),
  })
  .strict();
export type RazorpayRefundView = z.infer<typeof razorpayRefundViewSchema>;

/**
 * Staff view of everything Razorpay did for one obligation (TEST mode only). `paymentState` maps the
 * brief's states onto the existing model: PENDING (order open), PAID (matched capture; the
 * obligation is SUBMITTED until staff verify), RECONCILIATION_REQUIRED (a flagged capture),
 * FAILED/ABANDONED (closed without payment). AUTHORIZED never counts as paid.
 */
export const razorpayWorkspaceSchema = z
  .object({
    mode: z.literal('TEST'),
    refunds: z.enum(['off', 'full_only', 'partial']),
    orders: z.array(
      z
        .object({
          id: z.uuid(),
          attempt: z.number().int(),
          status: z.enum(['RESERVED', 'CREATED', 'PAID', 'ABANDONED', 'CREATE_FAILED']),
          paymentState: z.enum([
            'PENDING',
            'PAID',
            'RECONCILIATION_REQUIRED',
            'FAILED',
            'ABANDONED',
          ]),
          refundState: z.enum(['NONE', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED']),
          refundableMinor: z.number().int(),
          providerOrderId: z.string().nullable(),
          providerPaymentId: z.string().nullable(),
          amountMinor: z.number().int(),
          currency: z.string(),
          createdAt: z.iso.datetime(),
          events: z.array(
            z.object({
              kind: z.string(),
              reason: z.string().nullable(),
              createdAt: z.iso.datetime(),
            }),
          ),
        })
        .strict(),
    ),
    refundRequests: z.array(razorpayRefundViewSchema),
    audit: z.array(
      z.object({ action: z.string(), actor: z.string().nullable(), createdAt: z.iso.datetime() }),
    ),
  })
  .strict();
export type RazorpayWorkspace = z.infer<typeof razorpayWorkspaceSchema>;

/** The student's own Razorpay test attempts for one obligation (never another student's). */
export const studentRazorpayHistorySchema = z
  .object({
    orders: z.array(
      z
        .object({
          attempt: z.number().int(),
          paymentState: z.enum([
            'PENDING',
            'PAID',
            'RECONCILIATION_REQUIRED',
            'FAILED',
            'ABANDONED',
          ]),
          providerOrderId: z.string().nullable(),
          providerPaymentId: z.string().nullable(),
          amountMinor: z.number().int(),
          currency: z.string(),
          createdAt: z.iso.datetime(),
          checkoutReturnedAt: z.iso.datetime().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type StudentRazorpayHistory = z.infer<typeof studentRazorpayHistorySchema>;
