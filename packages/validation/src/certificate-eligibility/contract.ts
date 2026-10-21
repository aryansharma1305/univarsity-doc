import { z } from 'zod';
import { certificateTypeSchema, type CertificateType } from '../certificate-requests/schemas.js';
import {
  CERTIFICATE_DURATION_POLICY_ID,
  certificateDurationPolicySchema,
  certificateDurationTierSchema,
  unresolvedDurationReasonSchema,
  type DurationPolicyEvaluation,
} from './policy.js';

/**
 * Course certificate eligibility (Phase 12C).
 *
 * Four independent questions are kept apart everywhere, and none implies another:
 * 1. Which certificate TYPES may this course offer? (duration policy + approved course configuration)
 * 2. Can a student APPLY? (Phase 12B application policies, separately approved)
 * 3. Has this student COMPLETED / QUALIFIED? (not evaluated: no completion policy exists)
 * 4. Finance verification, Rector approval and issuance (not available)
 */

export const ALL_CERTIFICATE_TYPES = certificateTypeSchema.options;

const note = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) =>
        Array.from(v).every((c) => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))),
      'Unsupported control characters',
    );

// ---------------------------------------------------------------------------------------------
// Course configuration lifecycle
// ---------------------------------------------------------------------------------------------

export const eligibilityConfigStatusSchema = z.enum([
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'SUPERSEDED',
]);
export type EligibilityConfigStatus = z.infer<typeof eligibilityConfigStatusSchema>;

/** Staff proposal of a course's certificate set. Duration and policy are derived by the server. */
export const proposeCertificateEligibilitySchema = z
  .object({
    certificateTypes: z
      .array(certificateTypeSchema)
      .min(1)
      .max(ALL_CERTIFICATE_TYPES.length)
      .refine((v) => new Set(v).size === v.length, 'Each certificate type may appear only once'),
    /** University document/decision that authorizes this course's set (reference only). */
    authorityReference: note(200),
    rationale: note(1000).optional(),
  })
  .strict();
export type ProposeCertificateEligibility = z.infer<typeof proposeCertificateEligibilitySchema>;

export const eligibilityDecisionSchema = z
  .object({ version: z.number().int().positive(), note: note(1000).optional() })
  .strict();
export const eligibilityRejectionSchema = z
  .object({ version: z.number().int().positive(), note: note(1000) })
  .strict();
export type EligibilityDecision = z.infer<typeof eligibilityDecisionSchema>;

const actorSchema = z.object({ id: z.uuid(), displayName: z.string() }).strict();

export const certificateEligibilityConfigSchema = z
  .object({
    id: z.uuid(),
    programId: z.uuid(),
    revision: z.number().int().positive(),
    version: z.number().int().positive(),
    status: eligibilityConfigStatusSchema,
    certificateTypes: z.array(certificateTypeSchema).min(1),
    policyId: z.literal(CERTIFICATE_DURATION_POLICY_ID),
    policyVersion: z.number().int().positive(),
    durationMonths: z.number().int().positive(),
    tier: certificateDurationTierSchema,
    authorityReference: z.string(),
    rationale: z.string().nullable(),
    proposedBy: actorSchema,
    proposedAt: z.iso.datetime(),
    decidedBy: actorSchema.nullable(),
    decidedAt: z.iso.datetime().nullable(),
    decisionNote: z.string().nullable(),
    /** False when the course duration or the policy version changed after the proposal. */
    matchesCurrentCourse: z.boolean(),
  })
  .strict();
export type CertificateEligibilityConfig = z.infer<typeof certificateEligibilityConfigSchema>;

// ---------------------------------------------------------------------------------------------
// Per-type resolution (pure; shared by API, tests and documentation)
// ---------------------------------------------------------------------------------------------

export const typeEligibilitySchema = z.enum([
  /** The duration policy permits the type AND a current course configuration was approved. */
  'APPROVED_FOR_COURSE',
  /** The duration policy permits the type, but no current approved course configuration exists. */
  'PENDING_COURSE_APPROVAL',
  /** The policy does not permit the type for this duration, or the approved set leaves it out. */
  'NOT_OFFERED_FOR_COURSE',
  /** The course duration is missing or one of the unresolved boundaries: nothing is offered. */
  'POLICY_UNRESOLVED',
]);
export type TypeEligibility = z.infer<typeof typeEligibilitySchema>;

export const courseConfigurationStateSchema = z.enum([
  'APPROVED',
  'PENDING_APPROVAL',
  'NOT_CONFIGURED',
  /** An approved configuration exists but cites an older duration or policy version. */
  'OUT_OF_DATE',
]);
export type CourseConfigurationState = z.infer<typeof courseConfigurationStateSchema>;

export interface ApprovedConfigInput {
  readonly certificateTypes: readonly CertificateType[];
  readonly policyVersion: number;
  readonly durationMonths: number;
}

/** True only when an approved configuration still describes the course as it is today. */
export function configMatchesCourse(
  config: { policyVersion: number; durationMonths: number },
  evaluation: DurationPolicyEvaluation,
): boolean {
  return (
    evaluation.outcome === 'TIER' &&
    config.policyVersion === evaluation.policyVersion &&
    config.durationMonths === evaluation.durationMonths
  );
}

export function resolveCourseConfigurationState(
  evaluation: DurationPolicyEvaluation,
  approved: ApprovedConfigInput | null,
  hasPendingProposal: boolean,
): CourseConfigurationState {
  if (approved && configMatchesCourse(approved, evaluation)) return 'APPROVED';
  if (approved) return 'OUT_OF_DATE';
  return hasPendingProposal ? 'PENDING_APPROVAL' : 'NOT_CONFIGURED';
}

/**
 * Per-type eligibility for one course. Fails closed: a type is APPROVED_FOR_COURSE only when the
 * current duration policy permits it AND the approved configuration names it AND that configuration
 * still matches the course's current duration and policy version.
 */
export function resolveTypeEligibility(
  evaluation: DurationPolicyEvaluation,
  approved: ApprovedConfigInput | null,
): Record<CertificateType, TypeEligibility> {
  const current = approved && configMatchesCourse(approved, evaluation) ? approved : null;
  const result = {} as Record<CertificateType, TypeEligibility>;
  for (const type of ALL_CERTIFICATE_TYPES) {
    if (evaluation.outcome === 'UNRESOLVED') result[type] = 'POLICY_UNRESOLVED';
    else if (!evaluation.certificateTypes.includes(type)) result[type] = 'NOT_OFFERED_FOR_COURSE';
    else if (!current) result[type] = 'PENDING_COURSE_APPROVAL';
    else
      result[type] = current.certificateTypes.includes(type)
        ? 'APPROVED_FOR_COURSE'
        : 'NOT_OFFERED_FOR_COURSE';
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Staff course view
// ---------------------------------------------------------------------------------------------

export const durationEvaluationSchema = z
  .object({
    outcome: z.enum(['TIER', 'UNRESOLVED']),
    policyId: z.literal(CERTIFICATE_DURATION_POLICY_ID),
    policyVersion: z.number().int().positive(),
    durationMonths: z.number().int().positive().nullable(),
    tier: certificateDurationTierSchema.nullable(),
    unresolvedReason: unresolvedDurationReasonSchema.nullable(),
    permittedTypes: z.array(certificateTypeSchema),
  })
  .strict();
export type DurationEvaluationView = z.infer<typeof durationEvaluationSchema>;

export function durationEvaluationView(e: DurationPolicyEvaluation): DurationEvaluationView {
  return durationEvaluationSchema.parse({
    outcome: e.outcome,
    policyId: e.policyId,
    policyVersion: e.policyVersion,
    durationMonths: e.durationMonths,
    tier: e.outcome === 'TIER' ? e.tier : null,
    unresolvedReason: e.outcome === 'UNRESOLVED' ? e.reason : null,
    permittedTypes: [...e.certificateTypes],
  });
}

export const programCertificateEligibilitySchema = z
  .object({
    program: z
      .object({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        durationValue: z.number().int().nullable(),
        durationUnit: z.enum(['MONTHS', 'YEARS']).nullable(),
      })
      .strict(),
    policy: certificateDurationPolicySchema,
    evaluation: durationEvaluationSchema,
    configuration: courseConfigurationStateSchema,
    approved: certificateEligibilityConfigSchema.nullable(),
    pending: certificateEligibilityConfigSchema.nullable(),
    history: z.array(certificateEligibilityConfigSchema).max(100),
    types: z.array(
      z
        .object({ certificateType: certificateTypeSchema, eligibility: typeEligibilitySchema })
        .strict(),
    ),
    approval: z
      .object({
        /** False until the university authorizes an eligibility approver (code-defined, not a toggle). */
        enabled: z.boolean(),
        reason: z.string(),
      })
      .strict(),
    canPropose: z.boolean(),
    canWithdraw: z.boolean(),
    canDecide: z.boolean(),
    /** Fixed reminders: course approval is never qualification, Rector approval, payment or issuance. */
    boundaries: z.array(z.string()),
  })
  .strict();
export type ProgramCertificateEligibility = z.infer<typeof programCertificateEligibilitySchema>;

// ---------------------------------------------------------------------------------------------
// Student contract — STABLE, VERSIONED (consumed by the student portal and Codex UI-05)
// ---------------------------------------------------------------------------------------------

export const STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT =
  'docversity.student-certificate-eligibility';
export const STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT_VERSION = 1;

export const samplePreviewTemplateSchema = z
  .object({ templateId: z.string(), version: z.number().int().positive() })
  .strict();

export const studentCertificateEligibilityItemV1Schema = z
  .object({
    certificateType: certificateTypeSchema,
    typeEligibility: typeEligibilitySchema,
    /**
     * True only for APPROVED_FOR_COURSE. Consumers must not show any sample of a type for which this
     * is false, so a student never sees a certificate their course does not offer.
     */
    samplePreviewAllowed: z.boolean(),
    samplePreviewTemplate: samplePreviewTemplateSchema.nullable(),
    applicationAvailability: z.enum(['AVAILABLE', 'NOT_AVAILABLE']),
    courseCompletionStatus: z.literal('NOT_EVALUATED'),
    paymentVerification: z.literal('NOT_AVAILABLE'),
    rectorApproval: z.literal('NOT_AVAILABLE'),
    issuance: z.literal('NOT_AVAILABLE'),
  })
  .strict()
  .refine((v) => v.samplePreviewAllowed === (v.typeEligibility === 'APPROVED_FOR_COURSE'), {
    message: 'Sample previews are allowed exactly for approved course certificate types',
  })
  .refine((v) => v.samplePreviewAllowed === (v.samplePreviewTemplate !== null), {
    message: 'A sample template is present exactly when a preview is allowed',
  });
export type StudentCertificateEligibilityItemV1 = z.infer<
  typeof studentCertificateEligibilityItemV1Schema
>;

export const studentRegistrationEligibilityV1Schema = z
  .object({
    registrationId: z.uuid(),
    registrationNumber: z.string(),
    registrationStatus: z.string(),
    program: z
      .object({ code: z.string(), name: z.string(), durationMonths: z.number().int().nullable() })
      .strict(),
    duration: z
      .object({
        outcome: z.enum(['TIER', 'UNRESOLVED']),
        tier: certificateDurationTierSchema.nullable(),
        unresolvedReason: unresolvedDurationReasonSchema.nullable(),
      })
      .strict(),
    courseConfiguration: courseConfigurationStateSchema,
    certificates: z
      .array(studentCertificateEligibilityItemV1Schema)
      .length(ALL_CERTIFICATE_TYPES.length),
  })
  .strict();
export type StudentRegistrationEligibilityV1 = z.infer<
  typeof studentRegistrationEligibilityV1Schema
>;

export const studentCertificateEligibilityV1Schema = z
  .object({
    contract: z.literal(STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT),
    contractVersion: z.literal(STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT_VERSION),
    policy: z
      .object({
        id: z.literal(CERTIFICATE_DURATION_POLICY_ID),
        version: z.number().int().positive(),
      })
      .strict(),
    registrations: z.array(studentRegistrationEligibilityV1Schema).max(50),
  })
  .strict();
export type StudentCertificateEligibilityV1 = z.infer<typeof studentCertificateEligibilityV1Schema>;

export const studentRegistrationEligibilityResponseV1Schema = z
  .object({
    contract: z.literal(STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT),
    contractVersion: z.literal(STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT_VERSION),
    policy: studentCertificateEligibilityV1Schema.shape.policy,
    registration: studentRegistrationEligibilityV1Schema,
  })
  .strict();
export type StudentRegistrationEligibilityResponseV1 = z.infer<
  typeof studentRegistrationEligibilityResponseV1Schema
>;

// ---------------------------------------------------------------------------------------------
// Approval authority (code-defined; none exists until the university names an approver)
// ---------------------------------------------------------------------------------------------

/**
 * A university decision authorizing course certificate-set approvals. The API ships with NO
 * definition, so approval is disabled in every environment; isolated tests may supply a synthetic
 * one (accepted only under NODE_ENV=test). Holding the permission alone is never sufficient.
 */
export const certificateEligibilityApprovalAuthoritySchema = z
  .object({
    id: note(128),
    authorityReference: note(200),
    approved: z.literal(true),
    action: z.literal('APPROVE_COURSE_CERTIFICATE_SET'),
  })
  .strict();
export type CertificateEligibilityApprovalAuthority = z.infer<
  typeof certificateEligibilityApprovalAuthoritySchema
>;
