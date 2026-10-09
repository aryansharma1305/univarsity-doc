import { z } from 'zod';
import {
  activityItemSchema,
  listQuerySchema,
  optionalFilter,
  paginatedSchema,
} from '../academic/common.js';
import { isRegionGroup, paymentRegionSchema, reExamPaymentStatusSchema } from './payment-common.js';
import {
  currencyMinorDigits,
  feeSnapshotSchema,
  isKnownCurrency,
  reExamApplicationStatusSchema,
  toMinorUnits,
} from './re-exams.js';

/**
 * Re-exam payments (Phase 9C).
 *
 * Students pay OUTSIDE Docversity using the university's approved QR/instructions for their
 * country/region group, then submit a transaction reference (and evidence, if required). Staff confirm
 * the payment against the university's own account. Nothing is ever paid or verified automatically,
 * amounts are integer MINOR units, and no exchange rate is ever computed.
 */

export const PAYMENT_METHODS = ['UPI', 'BANK_TRANSFER', 'MOBILE_WALLET', 'OTHER'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  UPI: 'UPI QR',
  BANK_TRANSFER: 'Bank transfer QR',
  MOBILE_WALLET: 'Mobile wallet QR',
  OTHER: 'Other QR payment',
};

export const paymentEvidenceRequirementSchema = z.enum(['OPTIONAL', 'REQUIRED']);
export type PaymentEvidenceRequirement = z.infer<typeof paymentEvidenceRequirementSchema>;

/** Retention of payment records and evidence: not yet defined by the university (nothing is purged). */
export const RE_EXAM_PAYMENT_RETENTION = {
  status: 'PENDING_UNIVERSITY_POLICY',
  description:
    'Payment records and evidence are kept unchanged until the university defines a retention period. No automatic deletion runs.',
} as const;

// ----------------------------------------------------------------------------------------------
// Files
// ----------------------------------------------------------------------------------------------

/** QR images uploaded by staff. Stored only as a re-encoded copy without embedded metadata. */
export const PAYMENT_QR_RULES = {
  maxBytes: 2 * 1024 * 1024,
  acceptedTypes: ['image/png', 'image/jpeg'] as const,
  maxImagePixels: 25_000_000,
  minImageSide: 150,
} as const;

/** Payment evidence uploaded by students (receipt PDF or screenshot). */
export const PAYMENT_EVIDENCE_RULES = {
  maxBytes: 5 * 1024 * 1024,
  acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  maxImagePixels: 40_000_000,
  minImageSide: 150,
} as const;

// ----------------------------------------------------------------------------------------------
// Transaction references
// ----------------------------------------------------------------------------------------------

/** Upper-case letters and digits only — the form used for duplicate detection. */
export function normalizeTransactionReference(value: string): string {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * A payment's transaction/UTR/reference number as shown in the payer's confirmation. Never a PIN,
 * one-time code, password or card security code: short all-digit values (which look like those) and
 * text naming them are refused.
 */
export const transactionReferenceSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(6, 'Enter the full transaction reference (at least 6 characters).')
      .max(64, 'Use at most 64 characters.')
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9 ./:#_-]*$/,
        'Use only the letters, digits and separators shown in your payment confirmation.',
      )
      .refine((value) => !/\b(otp|pin|cvv|cvc|password|passcode)\b/i.test(value), {
        message:
          'Never enter a PIN, one-time code, password or card security code. Enter only the transaction reference.',
      })
      .refine((value) => !/^\d{4,6}$/.test(value), {
        message:
          'This looks like a PIN or one-time code. Never share those — enter the transaction reference from your payment confirmation.',
      })
      .refine((value) => normalizeTransactionReference(value).length >= 6, {
        message: 'Enter the full transaction reference (at least 6 letters or digits).',
      }),
  );

// ----------------------------------------------------------------------------------------------
// Destinations (staff)
// ----------------------------------------------------------------------------------------------

export const paymentDestinationStatusSchema = z.enum(['DRAFT', 'APPROVED', 'RETIRED']);
export type PaymentDestinationStatus = z.infer<typeof paymentDestinationStatusSchema>;

/** What students would experience right now. */
export const PAYMENT_DESTINATION_STATES = [
  'DRAFT',
  'AVAILABLE',
  'INACTIVE',
  'SCHEDULED',
  'EXPIRED',
  'RETIRED',
] as const;
export const paymentDestinationStateSchema = z.enum(PAYMENT_DESTINATION_STATES);
export type PaymentDestinationState = z.infer<typeof paymentDestinationStateSchema>;
export const PAYMENT_DESTINATION_STATE_LABELS: Record<PaymentDestinationState, string> = {
  DRAFT: 'Draft — not visible to students',
  AVAILABLE: 'Approved — shown to students',
  INACTIVE: 'Approved — switched off',
  SCHEDULED: 'Approved — not yet in effect',
  EXPIRED: 'Approved — validity ended',
  RETIRED: 'Retired',
};

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isKnownCurrency, 'Enter a valid ISO currency code (e.g. INR).');

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .trim()
      .max(max, `Use at most ${String(max)} characters.`)
      .nullable()
      .optional(),
  );

const dateTimeSchema = z.iso.datetime({ offset: true, error: 'Enter a valid date and time.' });

const rateInputSchema = z.object({
  attemptNumber: z.coerce.number().int().min(1).max(10),
  /** Major units as text, e.g. "1250" or "12.50". */
  amount: z.string().trim().min(1, 'Enter the amount.'),
});

const destinationFields = {
  countryName: optionalText(100),
  beneficiaryName: z
    .string()
    .trim()
    .min(2, 'Enter the beneficiary or payee name shown to students.')
    .max(200),
  method: paymentMethodSchema,
  currency: currencySchema,
  instructions: z
    .string()
    .trim()
    .min(10, 'Enter the payment instructions approved by the university.')
    .max(2000, 'Use at most 2000 characters.'),
  evidenceRequirement: paymentEvidenceRequirementSchema,
  effectiveFrom: dateTimeSchema,
  effectiveUntil: z.preprocess(
    (value) => (value === '' ? null : value),
    dateTimeSchema.nullable().optional(),
  ),
  /**
   * Approved amounts per attempt in THIS destination's currency — only for a currency different from
   * the re-exam fee's. Attempts without an amount cannot pay here. Never a conversion.
   */
  rates: z.array(rateInputSchema).max(10).optional(),
};

function refineDestination(
  value: {
    currency?: string;
    rates?: { attemptNumber: number; amount: string }[];
    effectiveFrom?: string;
    effectiveUntil?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  value.rates?.forEach((rate, index) => {
    if (rate.attemptNumber !== index + 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['rates', index, 'attemptNumber'],
        message: 'Attempts must be listed in order from 1 without gaps.',
      });
    }
    if (
      value.currency &&
      isKnownCurrency(value.currency) &&
      toMinorUnits(rate.amount, value.currency) === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['rates', index, 'amount'],
        message: `Enter a positive amount with at most ${String(currencyMinorDigits(value.currency))} decimal places.`,
      });
    }
  });
  if (
    value.effectiveFrom &&
    value.effectiveUntil &&
    Date.parse(value.effectiveUntil) <= Date.parse(value.effectiveFrom)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['effectiveUntil'],
      message: 'The end must be after the start.',
    });
  }
}

export const createPaymentDestinationSchema = z
  .object({
    region: paymentRegionSchema,
    ...destinationFields,
    /** Prepare a replacement of the region's APPROVED destination (e.g. a new QR). */
    replacesDestinationId: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.countryName && !isRegionGroup(value.region)) {
      ctx.addIssue({
        code: 'custom',
        path: ['countryName'],
        message: 'A country is only entered for Europe, Central Asia or Others.',
      });
    }
    refineDestination(value, ctx);
  })
  .meta({ id: 'CreatePaymentDestination' });

export const updatePaymentDestinationSchema = z
  .object(destinationFields)
  .partial()
  .strict()
  .superRefine(refineDestination)
  .meta({ id: 'UpdatePaymentDestination' });

export const approvePaymentDestinationSchema = z
  .object({
    /**
     * The approver confirms the beneficiary, currency, amounts and QR are the university's real,
     * approved payment details (no test or invented values).
     */
    confirmApproved: z.literal(true, {
      error: 'Confirm that the university approved these payment details.',
    }),
  })
  .strict()
  .meta({ id: 'ApprovePaymentDestination' });

export const setPaymentDestinationActiveSchema = z
  .object({ active: z.boolean() })
  .strict()
  .meta({ id: 'SetPaymentDestinationActive' });

const personSchema = z.object({ id: z.uuid(), displayName: z.string() }).nullable();

export const paymentDestinationSchema = z
  .object({
    id: z.uuid(),
    region: paymentRegionSchema,
    version: z.number().int(),
    status: paymentDestinationStatusSchema,
    state: paymentDestinationStateSchema,
    isActive: z.boolean(),
    countryName: z.string().nullable(),
    beneficiaryName: z.string(),
    method: paymentMethodSchema,
    currency: z.string(),
    instructions: z.string(),
    evidenceRequirement: paymentEvidenceRequirementSchema,
    effectiveFrom: z.iso.datetime(),
    effectiveUntil: z.iso.datetime().nullable(),
    qr: z
      .object({ contentType: z.string(), sizeBytes: z.number().int(), sha256: z.string() })
      .nullable(),
    rates: z.array(z.object({ attemptNumber: z.number().int(), amountMinor: z.number().int() })),
    replacesDestinationId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    createdBy: personSchema,
    updatedAt: z.iso.datetime(),
    updatedBy: personSchema,
    approvedAt: z.iso.datetime().nullable(),
    approvedBy: personSchema,
    retiredAt: z.iso.datetime().nullable(),
    retiredBy: personSchema,
    /** Payment obligations created against this version. */
    paymentCount: z.number().int(),
  })
  .meta({ id: 'PaymentDestination' });

export const paymentDestinationListSchema = z
  .object({
    /** One entry per requested region, with the version students would see. */
    regions: z.array(
      z.object({
        region: paymentRegionSchema,
        label: z.string(),
        isGroup: z.boolean(),
        approved: paymentDestinationSchema.nullable(),
        draftCount: z.number().int(),
      }),
    ),
    data: z.array(paymentDestinationSchema),
    /** The active re-exam fee rule's currency (amounts in it come from the fee rule), if any. */
    feeCurrency: z.string().nullable(),
  })
  .meta({ id: 'PaymentDestinationList' });

export const paymentDestinationDetailSchema = paymentDestinationSchema
  .extend({ history: z.array(activityItemSchema) })
  .meta({ id: 'PaymentDestinationDetail' });

// ----------------------------------------------------------------------------------------------
// Payments
// ----------------------------------------------------------------------------------------------

export const reExamPaymentAmountSourceSchema = z.enum(['FEE_RULE', 'DESTINATION_RATE']);

/** Why a country/region cannot be used for a particular application right now. */
export const PAYMENT_REGION_UNAVAILABLE_REASONS = ['NOT_CONFIGURED', 'NO_APPROVED_AMOUNT'] as const;
export type PaymentRegionUnavailableReason = (typeof PAYMENT_REGION_UNAVAILABLE_REASONS)[number];
export const PAYMENT_REGION_UNAVAILABLE_MESSAGES: Record<PaymentRegionUnavailableReason, string> = {
  NOT_CONFIGURED:
    'The university has not published payment details for this country or region yet.',
  NO_APPROVED_AMOUNT:
    'No fee has been approved for your attempt in this country’s or region’s currency yet.',
};

export const startReExamPaymentSchema = z
  .object({ region: paymentRegionSchema })
  .strict()
  .meta({ id: 'StartReExamPayment' });

/** Text part of the multipart submission (the optional/required file is `evidence`). */
export const submitReExamPaymentSchema = z
  .object({ transactionReference: transactionReferenceSchema })
  .strict()
  .meta({ id: 'SubmitReExamPayment' });

export const verifyReExamPaymentSchema = z
  .object({
    /** The amount actually received, in major units as text (e.g. "1000.00"). */
    verifiedAmount: z.string().trim().min(1, 'Enter the amount received.'),
    verifiedCurrency: currencySchema,
    /** Staff confirm they checked the university's own account / reconciliation records. */
    confirmedAgainstUniversityAccount: z.literal(true, {
      error: 'Confirm that you checked the university’s account or reconciliation records.',
    }),
    note: optionalText(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      isKnownCurrency(value.verifiedCurrency) &&
      toMinorUnits(value.verifiedAmount, value.verifiedCurrency) === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['verifiedAmount'],
        message: `Enter a positive amount with at most ${String(currencyMinorDigits(value.verifiedCurrency))} decimal places.`,
      });
    }
  })
  .meta({ id: 'VerifyReExamPayment' });

export const rejectReExamPaymentSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Explain why the payment could not be verified (at least 5 characters).')
      .max(1000, 'Use at most 1000 characters.'),
  })
  .strict()
  .meta({ id: 'RejectReExamPayment' });

/** One payment as the student sees it (their own data only; no staff names). */
export const studentReExamPaymentSchema = z.object({
  id: z.uuid(),
  status: reExamPaymentStatusSchema,
  region: paymentRegionSchema,
  amountMinor: z.number().int(),
  currency: z.string(),
  createdAt: z.iso.datetime(),
  destination: z.object({
    countryName: z.string().nullable(),
    beneficiaryName: z.string(),
    method: paymentMethodSchema,
    instructions: z.string(),
    evidenceRequirement: paymentEvidenceRequirementSchema,
    /** Whether the destination can still be shown (its QR is served only then). */
    available: z.boolean(),
  }),
  transactionReference: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  hasEvidence: z.boolean(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
});

export const studentReExamPaymentViewSchema = z
  .object({
    application: z.object({
      id: z.uuid(),
      reference: z.string(),
      status: reExamApplicationStatusSchema,
      studentName: z.string(),
      registrationNumber: z.string(),
      programName: z.string(),
      academicSessionName: z.string(),
      examinationName: z.string(),
      examSession: z.string(),
      periodLabel: z.string(),
      subject: z.object({ code: z.string(), name: z.string() }),
      attemptNumber: z.number().int(),
      attemptBasis: z.string(),
    }),
    fee: feeSnapshotSchema,
    /** Null when a payment can be started or submitted for this application. */
    unavailableReason: z.string().nullable(),
    regions: z.array(
      z.object({
        region: paymentRegionSchema,
        label: z.string(),
        isGroup: z.boolean(),
        available: z.boolean(),
        unavailableReason: z.enum(PAYMENT_REGION_UNAVAILABLE_REASONS).nullable(),
      }),
    ),
    /** The live payment (awaiting, submitted or verified), if any. */
    current: studentReExamPaymentSchema.nullable(),
    /** Earlier payments that were not verified or were replaced. */
    previous: z.array(studentReExamPaymentSchema),
    retention: z.string(),
  })
  .meta({ id: 'StudentReExamPaymentView' });

export const reExamPaymentRowSchema = z
  .object({
    id: z.uuid(),
    status: reExamPaymentStatusSchema,
    region: paymentRegionSchema,
    amountMinor: z.number().int(),
    currency: z.string(),
    createdAt: z.iso.datetime(),
    submittedAt: z.iso.datetime().nullable(),
    reviewedAt: z.iso.datetime().nullable(),
    application: z.object({
      id: z.uuid(),
      reference: z.string(),
      status: reExamApplicationStatusSchema,
      attemptNumber: z.number().int(),
    }),
    student: z.object({ id: z.uuid(), name: z.string() }),
    registrationNumber: z.string(),
    subject: z.object({ code: z.string(), name: z.string() }),
    transactionReference: z.string().nullable(),
    hasEvidence: z.boolean(),
  })
  .meta({ id: 'ReExamPaymentRow' });

export const reExamPaymentDetailSchema = reExamPaymentRowSchema
  .extend({
    amountSource: reExamPaymentAmountSourceSchema,
    feeRuleVersion: z.number().int(),
    destination: z.object({
      id: z.uuid(),
      version: z.number().int(),
      countryName: z.string().nullable(),
      beneficiaryName: z.string(),
      method: paymentMethodSchema,
      currency: z.string(),
    }),
    programName: z.string(),
    academicSessionName: z.string(),
    examinationName: z.string(),
    periodLabel: z.string(),
    evidence: z
      .object({ contentType: z.string(), sizeBytes: z.number().int(), sha256: z.string() })
      .nullable(),
    reviewedBy: personSchema,
    verifiedAmountMinor: z.number().int().nullable(),
    verifiedCurrency: z.string().nullable(),
    reviewNote: z.string().nullable(),
    rejectionReason: z.string().nullable(),
    voidedAt: z.iso.datetime().nullable(),
    voidReason: z.string().nullable(),
    /** Other payments of the same application (newest first). */
    otherPayments: z.array(
      z.object({ id: z.uuid(), status: reExamPaymentStatusSchema, createdAt: z.iso.datetime() }),
    ),
    /** Other payments that used the same transaction reference (e.g. rejected earlier). */
    sameReference: z.array(
      z.object({
        id: z.uuid(),
        status: reExamPaymentStatusSchema,
        applicationReference: z.string(),
      }),
    ),
    history: z.array(activityItemSchema),
  })
  .meta({ id: 'ReExamPaymentDetail' });

export const reExamPaymentListSchema = paginatedSchema(reExamPaymentRowSchema).meta({
  id: 'ReExamPaymentList',
});

export const RE_EXAM_PAYMENT_SORT_FIELDS = ['submittedAt', 'createdAt'] as const;
export const reExamPaymentQuerySchema = listQuerySchema(
  RE_EXAM_PAYMENT_SORT_FIELDS,
  'submittedAt',
  {
    status: optionalFilter(reExamPaymentStatusSchema),
    region: optionalFilter(paymentRegionSchema),
  },
);

export type CreatePaymentDestination = z.infer<typeof createPaymentDestinationSchema>;
export type CreatePaymentDestinationInput = z.input<typeof createPaymentDestinationSchema>;
export type UpdatePaymentDestination = z.infer<typeof updatePaymentDestinationSchema>;
export type ApprovePaymentDestination = z.infer<typeof approvePaymentDestinationSchema>;
export type SetPaymentDestinationActive = z.infer<typeof setPaymentDestinationActiveSchema>;
export type PaymentDestination = z.infer<typeof paymentDestinationSchema>;
export type PaymentDestinationList = z.infer<typeof paymentDestinationListSchema>;
export type PaymentDestinationDetail = z.infer<typeof paymentDestinationDetailSchema>;
export type StartReExamPayment = z.infer<typeof startReExamPaymentSchema>;
export type SubmitReExamPayment = z.infer<typeof submitReExamPaymentSchema>;
export type VerifyReExamPayment = z.infer<typeof verifyReExamPaymentSchema>;
export type VerifyReExamPaymentInput = z.input<typeof verifyReExamPaymentSchema>;
export type RejectReExamPayment = z.infer<typeof rejectReExamPaymentSchema>;
export type StudentReExamPayment = z.infer<typeof studentReExamPaymentSchema>;
export type StudentReExamPaymentView = z.infer<typeof studentReExamPaymentViewSchema>;
export type ReExamPaymentRow = z.infer<typeof reExamPaymentRowSchema>;
export type ReExamPaymentDetail = z.infer<typeof reExamPaymentDetailSchema>;
export type ReExamPaymentList = z.infer<typeof reExamPaymentListSchema>;
export type ReExamPaymentQuery = z.infer<typeof reExamPaymentQuerySchema>;
