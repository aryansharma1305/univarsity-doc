import { z } from 'zod';
import {
  activityItemSchema,
  listQuerySchema,
  optionalFilter,
  paginatedSchema,
} from '../academic/common.js';
import { academicStructureSchema } from '../academic/curricula.js';
import { reExamPaymentSummarySchema } from './payment-common.js';

/**
 * Re-exam applications (Phase 9B).
 *
 * One application = one registration + one re-examination record + one subject of that period. The
 * server derives the attempt number and the fee; the client never sends either. Fee amounts are
 * integer MINOR units of their currency (paise for INR) — never floating point.
 */

// ----------------------------------------------------------------------------------------------
// Money (exact)
// ----------------------------------------------------------------------------------------------

/** ISO 4217 codes the runtime knows (Intl). */
export function isKnownCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    return Intl.supportedValuesOf('currency').includes(code);
  } catch {
    return false;
  }
}

/** Decimal places of a currency's minor unit (INR 2, JPY 0, …). */
export function currencyMinorDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/**
 * "1000", "1000.5" or "1000.50" → integer minor units, using string arithmetic only. Returns null for
 * anything that is not a positive amount with at most the currency's decimal places.
 */
export function toMinorUnits(amount: string, currency: string): number | null {
  const digits = currencyMinorDigits(currency);
  const match = /^(\d{1,9})(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > digits) return null;
  const minor = Number(`${whole}${fraction.padEnd(digits, '0')}`);
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 2_147_483_647 ? minor : null;
}

/** Display only (e.g. "₹1,000.00"). */
export function formatMoney(amountMinor: number, currency: string): string {
  const digits = currencyMinorDigits(currency);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}

/** "RX-1B97-2390": the random tail of an application's UUIDv7. Display only. */
export function reExamReference(id: string): string {
  const tail = id.replace(/-/g, '').slice(-8).toUpperCase();
  return `RX-${tail.slice(0, 4)}-${tail.slice(4)}`;
}

// ----------------------------------------------------------------------------------------------
// Fee rules
// ----------------------------------------------------------------------------------------------

export const RE_EXAM_FEE_SCOPES = [
  'PER_SUBJECT',
  'PER_APPLICATION',
  'PER_EXAMINATION_SESSION',
] as const;
export const reExamFeeScopeSchema = z.enum(RE_EXAM_FEE_SCOPES);
export const RE_EXAM_FEE_SCOPE_LABELS: Record<ReExamFeeScope, string> = {
  PER_SUBJECT: 'Per subject (paper)',
  PER_APPLICATION: 'Per application',
  PER_EXAMINATION_SESSION: 'Per examination session',
};

/**
 * How attempts are counted (stored on every rule and application). Re-exam attempt n = 1 + the number
 * of earlier re-exam applications of the same registration and catalogue subject that were not
 * rejected or cancelled. Pending university confirmation (policy P2).
 */
export const RE_EXAM_ATTEMPT_BASIS = 'NON_REJECTED_RE_EXAM_APPLICATIONS';
export const RE_EXAM_ATTEMPT_BASIS_LABEL =
  'Earlier re-exam applications for the same registration and subject that were not rejected or cancelled';

export const reExamFeeRuleStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'RETIRED']);

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isKnownCurrency, 'Enter a valid ISO currency code (e.g. INR).');

export const createReExamFeeRuleSchema = z
  .object({
    scope: reExamFeeScopeSchema,
    currency: currencySchema,
    rates: z
      .array(
        z.object({
          attemptNumber: z.coerce.number().int().min(1).max(10),
          /** Major units as text, e.g. "1000" or "1000.00". */
          amount: z.string().trim().min(1, 'Enter the amount.'),
        }),
      )
      .min(1, 'Add the fee for at least the first attempt.')
      .max(10),
    note: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().max(1000).nullable().optional(),
    ),
  })
  .strict()
  .superRefine((rule, ctx) => {
    rule.rates.forEach((rate, index) => {
      if (rate.attemptNumber !== index + 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['rates', index, 'attemptNumber'],
          message: 'Attempts must be listed in order from 1 without gaps.',
        });
      }
      if (isKnownCurrency(rule.currency) && toMinorUnits(rate.amount, rule.currency) === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['rates', index, 'amount'],
          message: `Enter a positive amount with at most ${String(currencyMinorDigits(rule.currency))} decimal places.`,
        });
      }
    });
  })
  .meta({ id: 'CreateReExamFeeRule' });

const personSchema = z.object({ id: z.uuid(), displayName: z.string() }).nullable();

export const reExamFeeRuleSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int(),
    status: reExamFeeRuleStatusSchema,
    scope: reExamFeeScopeSchema,
    currency: z.string(),
    attemptBasis: z.string(),
    note: z.string().nullable(),
    rates: z.array(z.object({ attemptNumber: z.number().int(), amountMinor: z.number().int() })),
    createdAt: z.iso.datetime(),
    createdBy: personSchema,
    activatedAt: z.iso.datetime().nullable(),
    activatedBy: personSchema,
    retiredAt: z.iso.datetime().nullable(),
    retiredBy: personSchema,
  })
  .meta({ id: 'ReExamFeeRule' });

export const reExamFeeRuleListSchema = z
  .object({ data: z.array(reExamFeeRuleSchema) })
  .meta({ id: 'ReExamFeeRuleList' });

// ----------------------------------------------------------------------------------------------
// Applications
// ----------------------------------------------------------------------------------------------

export const RE_EXAM_APPLICATION_STATUSES = [
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export const reExamApplicationStatusSchema = z.enum(RE_EXAM_APPLICATION_STATUSES);
export const RE_EXAM_STATUS_LABELS: Record<ReExamApplicationStatus, string> = {
  SUBMITTED: 'Submitted — awaiting decision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const RE_EXAM_FEE_BLOCKED_REASONS = [
  'NO_ACTIVE_RULE',
  'SCOPE_NOT_SUPPORTED',
  'NO_RATE_FOR_ATTEMPT',
] as const;
export type ReExamFeeBlockedReason = (typeof RE_EXAM_FEE_BLOCKED_REASONS)[number];
export const RE_EXAM_FEE_BLOCKED_MESSAGES: Record<ReExamFeeBlockedReason, string> = {
  NO_ACTIVE_RULE: 'The university has not configured re-exam fees yet. Payment cannot start.',
  SCOPE_NOT_SUPPORTED:
    'The configured fee scope (per examination session) is not defined well enough to calculate a fee. Payment cannot start.',
  NO_RATE_FOR_ATTEMPT: 'No fee has been approved for this attempt number. Payment cannot start.',
};

export const feeSnapshotSchema = z.object({
  status: z.enum(['ASSESSED', 'NOT_CONFIGURED']),
  blockedReason: z.enum(RE_EXAM_FEE_BLOCKED_REASONS).nullable(),
  amountMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
  scope: reExamFeeScopeSchema.nullable(),
  ruleVersion: z.number().int().nullable(),
  assessedAt: z.iso.datetime().nullable(),
});

export const reExamApplicationRowSchema = z
  .object({
    id: z.uuid(),
    reference: z.string(),
    status: reExamApplicationStatusSchema,
    submittedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    student: z.object({ id: z.uuid(), name: z.string() }),
    registrationId: z.uuid(),
    registrationNumber: z.string(),
    program: z.object({ code: z.string(), name: z.string() }),
    academicSessionName: z.string(),
    periodLabel: z.string(),
    examination: z.object({ id: z.uuid(), name: z.string(), examSession: z.string() }),
    subject: z.object({ code: z.string(), name: z.string() }),
    attemptNumber: z.number().int(),
    fee: feeSnapshotSchema,
  })
  .meta({ id: 'ReExamApplicationRow' });

export const reExamApplicationDetailSchema = reExamApplicationRowSchema
  .extend({
    attemptBasis: z.string(),
    decisionReason: z.string().nullable(),
    decidedBy: personSchema,
    cancelledAt: z.iso.datetime().nullable(),
    /** The latest payment (Phase 9C), shown for information — it never decides the application. */
    payment: reExamPaymentSummarySchema.nullable(),
    history: z.array(activityItemSchema),
  })
  .meta({ id: 'ReExamApplicationDetail' });

export const reExamApplicationListSchema = paginatedSchema(reExamApplicationRowSchema).meta({
  id: 'ReExamApplicationList',
});

export const RE_EXAM_SORT_FIELDS = ['submittedAt', 'registrationNumber'] as const;
export const reExamApplicationQuerySchema = listQuerySchema(RE_EXAM_SORT_FIELDS, 'submittedAt', {
  status: optionalFilter(reExamApplicationStatusSchema),
  programId: optionalFilter(z.uuid()),
  academicSessionId: optionalFilter(z.uuid()),
  examinationId: optionalFilter(z.uuid()),
  periodNumber: optionalFilter(z.coerce.number().int().min(1).max(40)),
});

/** Export takes the same filters, without paging. */
export const reExamApplicationExportQuerySchema = reExamApplicationQuerySchema
  .omit({ page: true, pageSize: true })
  .meta({ id: 'ReExamApplicationExportQuery' });

export const approveReExamApplicationSchema = z
  .object({
    note: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().max(1000).nullable().optional(),
    ),
  })
  .strict()
  .meta({ id: 'ApproveReExamApplication' });

export const rejectReExamApplicationSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Explain the decision (at least 5 characters).')
      .max(1000, 'Use at most 1000 characters.'),
  })
  .strict()
  .meta({ id: 'RejectReExamApplication' });

// ----------------------------------------------------------------------------------------------
// Student
// ----------------------------------------------------------------------------------------------

/** What a student can apply for, derived from their own registrations and curricula. */
export const studentReExamOptionsSchema = z
  .object({
    registrations: z.array(
      z.object({
        registrationId: z.uuid(),
        studentName: z.string(),
        registrationNumber: z.string(),
        program: z.object({ code: z.string(), name: z.string() }),
        academicSessionName: z.string(),
        structureType: academicStructureSchema.nullable(),
        /** Why this registration cannot apply online (null = it can, if examinations are open). */
        unavailableReason: z.string().nullable(),
        examinations: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            examSession: z.string(),
            period: z.object({ number: z.number().int(), label: z.string() }),
            subjects: z.array(
              z.object({
                programSubjectId: z.uuid(),
                code: z.string(),
                name: z.string(),
                alreadyApplied: z.boolean(),
                /** What the server would record if the student applied now. */
                attemptNumber: z.number().int(),
                fee: feeSnapshotSchema.omit({ ruleVersion: true, assessedAt: true }),
              }),
            ),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'StudentReExamOptions' });

export const createReExamApplicationSchema = z
  .object({
    registrationId: z.uuid({ error: 'Choose your registration.' }),
    examinationId: z.uuid({ error: 'Choose the re-examination.' }),
    programSubjectId: z.uuid({ error: 'Choose the subject.' }),
  })
  .strict()
  .meta({ id: 'CreateReExamApplication' });

export const studentReExamApplicationSchema = z
  .object({
    id: z.uuid(),
    reference: z.string(),
    status: reExamApplicationStatusSchema,
    submittedAt: z.iso.datetime(),
    registrationNumber: z.string(),
    programName: z.string(),
    academicSessionName: z.string(),
    periodLabel: z.string(),
    examinationName: z.string(),
    examSession: z.string(),
    subject: z.object({ code: z.string(), name: z.string() }),
    attemptNumber: z.number().int(),
    fee: feeSnapshotSchema,
    decidedAt: z.iso.datetime().nullable(),
    /** The reason given by the university for its decision (rejections always have one). */
    decisionReason: z.string().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
    /** The latest payment (Phase 9C), if one was started. */
    payment: reExamPaymentSummarySchema.nullable(),
    history: z.array(z.object({ summary: z.string(), createdAt: z.iso.datetime() })),
  })
  .meta({ id: 'StudentReExamApplication' });

export const studentReExamApplicationListSchema = z
  .object({ data: z.array(studentReExamApplicationSchema) })
  .meta({ id: 'StudentReExamApplicationList' });

export type ReExamFeeScope = z.infer<typeof reExamFeeScopeSchema>;
export type ReExamFeeRuleStatus = z.infer<typeof reExamFeeRuleStatusSchema>;
export type CreateReExamFeeRule = z.infer<typeof createReExamFeeRuleSchema>;
export type CreateReExamFeeRuleInput = z.input<typeof createReExamFeeRuleSchema>;
export type ReExamFeeRule = z.infer<typeof reExamFeeRuleSchema>;
export type ReExamFeeRuleList = z.infer<typeof reExamFeeRuleListSchema>;
export type ReExamApplicationStatus = z.infer<typeof reExamApplicationStatusSchema>;
export type FeeSnapshot = z.infer<typeof feeSnapshotSchema>;
export type ReExamApplicationRow = z.infer<typeof reExamApplicationRowSchema>;
export type ReExamApplicationDetail = z.infer<typeof reExamApplicationDetailSchema>;
export type ReExamApplicationList = z.infer<typeof reExamApplicationListSchema>;
export type ReExamApplicationQuery = z.infer<typeof reExamApplicationQuerySchema>;
export type ReExamApplicationExportQuery = z.infer<typeof reExamApplicationExportQuerySchema>;
export type ApproveReExamApplication = z.infer<typeof approveReExamApplicationSchema>;
export type RejectReExamApplication = z.infer<typeof rejectReExamApplicationSchema>;
export type StudentReExamOptions = z.infer<typeof studentReExamOptionsSchema>;
export type CreateReExamApplication = z.infer<typeof createReExamApplicationSchema>;
export type StudentReExamApplication = z.infer<typeof studentReExamApplicationSchema>;
export type StudentReExamApplicationList = z.infer<typeof studentReExamApplicationListSchema>;
