import { z } from 'zod';
import { certificateTypeSchema, type CertificateType } from '../certificate-requests/schemas.js';

/**
 * University course-duration certificate policy (Phase 12C).
 *
 * Source: the university mentor's clarification relayed in the Phase 12C policy update. This is a
 * released, immutable code snapshot: a changed university rule is a NEW version appended below, never
 * an edit, so a stored proposal can always be re-evaluated against the exact version it cited.
 *
 * The policy only says which certificate TYPES a course of a given duration may offer. It is not
 * student qualification, course completion, Finance verification, Rector approval or permission to
 * issue anything. A per-course set still has to be proposed and separately approved by staff.
 *
 * Durations are normalised to whole months on the server from the program record
 * (`programs.duration_value` + `duration_unit`). Clients never supply a duration.
 */
export const CERTIFICATE_DURATION_POLICY_ID = 'UNIVERSITY_COURSE_DURATION_CERTIFICATES';

export const certificateDurationTierSchema = z.enum([
  'SHORT_COURSE',
  'MORE_THAN_ONE_YEAR',
  'MORE_THAN_TWO_YEARS',
]);
export type CertificateDurationTier = z.infer<typeof certificateDurationTierSchema>;

export const unresolvedDurationReasonSchema = z.enum([
  'MISSING_DURATION',
  'BELOW_TWO_MONTHS',
  'FOUR_TO_FIVE_MONTHS',
  'SEVEN_TO_ELEVEN_MONTHS',
  'EXACTLY_TWELVE_MONTHS',
]);
export type UnresolvedDurationReason = z.infer<typeof unresolvedDurationReasonSchema>;

interface TierDefinition {
  readonly tier: CertificateDurationTier;
  readonly label: string;
  /** Exact month values (SHORT_COURSE) or an exclusive-lower/inclusive-upper range in months. */
  readonly months:
    | { readonly kind: 'EXACT'; readonly values: readonly number[] }
    | { readonly kind: 'RANGE'; readonly above: number; readonly through: number | null };
  readonly certificateTypes: readonly CertificateType[];
}

interface UnresolvedDefinition {
  readonly reason: UnresolvedDurationReason;
  readonly label: string;
}

export interface CertificateDurationPolicyVersion {
  readonly id: typeof CERTIFICATE_DURATION_POLICY_ID;
  readonly version: number;
  readonly authorityReference: string;
  readonly tiers: readonly TierDefinition[];
  readonly unresolved: readonly UnresolvedDefinition[];
  /** Explicit non-assumptions recorded with the policy so reviewers see them next to the rules. */
  readonly notes: readonly string[];
}

const VERSION_ONE: CertificateDurationPolicyVersion = Object.freeze({
  id: CERTIFICATE_DURATION_POLICY_ID,
  version: 1,
  authorityReference:
    'University mentor clarification, Phase 12C policy update (course-duration certificate eligibility)',
  tiers: Object.freeze<TierDefinition[]>([
    {
      tier: 'SHORT_COURSE',
      label: 'Short course: 2–3 months or 6 months',
      months: { kind: 'EXACT', values: Object.freeze([2, 3, 6]) },
      certificateTypes: Object.freeze(['COURSE_COMPLETION'] as const),
    },
    {
      tier: 'MORE_THAN_ONE_YEAR',
      label: 'More than 12 months, through 24 months',
      months: { kind: 'RANGE', above: 12, through: 24 },
      certificateTypes: Object.freeze(['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER'] as const),
    },
    {
      tier: 'MORE_THAN_TWO_YEARS',
      label: 'More than 24 months',
      months: { kind: 'RANGE', above: 24, through: null },
      certificateTypes: Object.freeze([
        'TRANSCRIPT',
        'PROVISIONAL',
        'CHARACTER',
        'MIGRATION',
      ] as const),
    },
  ]),
  unresolved: Object.freeze<UnresolvedDefinition[]>([
    { reason: 'MISSING_DURATION', label: 'The course has no recorded duration' },
    { reason: 'BELOW_TWO_MONTHS', label: 'Shorter than 2 months' },
    { reason: 'FOUR_TO_FIVE_MONTHS', label: '4 or 5 months' },
    { reason: 'SEVEN_TO_ELEVEN_MONTHS', label: '7 to 11 months' },
    { reason: 'EXACTLY_TWELVE_MONTHS', label: 'Exactly 12 months (1 year)' },
  ]),
  notes: Object.freeze([
    'Exactly 24 months follows the literal "more than 1 year" tier; Migration is not granted.',
    'Courses longer than 12 months are not assumed to also receive a Course Completion Certificate.',
    'Unresolved durations fail closed: no certificate type is offered until the university decides.',
  ]),
});

/** Released versions, oldest first. Append only. */
const VERSIONS: readonly CertificateDurationPolicyVersion[] = Object.freeze([VERSION_ONE]);

export function certificateDurationPolicy(version?: number): CertificateDurationPolicyVersion {
  const found =
    version === undefined
      ? VERSIONS[VERSIONS.length - 1]
      : VERSIONS.find((v) => v.version === version);
  if (!found) throw new Error('Unknown certificate duration policy version.');
  return found;
}

export const CURRENT_CERTIFICATE_DURATION_POLICY_VERSION = certificateDurationPolicy().version;

/** Whole months from the program record, or null when the duration is missing or malformed. */
export function durationInMonths(
  value: number | null | undefined,
  unit: string | null | undefined,
): number | null {
  if (value == null || unit == null) return null;
  if (!Number.isInteger(value) || value <= 0) return null;
  if (unit === 'MONTHS') return value;
  if (unit === 'YEARS') return value * 12;
  return null;
}

export type DurationPolicyEvaluation =
  | {
      readonly outcome: 'TIER';
      readonly policyId: string;
      readonly policyVersion: number;
      readonly durationMonths: number;
      readonly tier: CertificateDurationTier;
      readonly certificateTypes: readonly CertificateType[];
    }
  | {
      readonly outcome: 'UNRESOLVED';
      readonly policyId: string;
      readonly policyVersion: number;
      readonly durationMonths: number | null;
      readonly reason: UnresolvedDurationReason;
      readonly certificateTypes: readonly [];
    };

function inTier(months: number, tier: TierDefinition) {
  if (tier.months.kind === 'EXACT') return tier.months.values.includes(months);
  return (
    months > tier.months.above && (tier.months.through === null || months <= tier.months.through)
  );
}

function unresolvedReason(months: number | null): UnresolvedDurationReason {
  if (months === null) return 'MISSING_DURATION';
  if (months < 2) return 'BELOW_TWO_MONTHS';
  if (months === 4 || months === 5) return 'FOUR_TO_FIVE_MONTHS';
  if (months >= 7 && months <= 11) return 'SEVEN_TO_ELEVEN_MONTHS';
  if (months === 12) return 'EXACTLY_TWELVE_MONTHS';
  // Every remaining month value is covered by a tier; reaching here means the policy changed
  // without updating this function, which must fail loudly rather than grant anything.
  throw new Error(`Duration of ${months} months is neither a tier nor a recorded unresolved case.`);
}

/**
 * Evaluate a course duration against a released policy version. Pure and deterministic: the same
 * stored duration and version always give the same answer. Never grants a type outside a tier.
 */
export function evaluateCourseDuration(
  value: number | null | undefined,
  unit: string | null | undefined,
  version?: number,
): DurationPolicyEvaluation {
  const policy = certificateDurationPolicy(version);
  const months = durationInMonths(value, unit);
  const tier = months === null ? undefined : policy.tiers.find((t) => inTier(months, t));
  if (months !== null && tier) {
    return {
      outcome: 'TIER',
      policyId: policy.id,
      policyVersion: policy.version,
      durationMonths: months,
      tier: tier.tier,
      certificateTypes: [...tier.certificateTypes],
    };
  }
  return {
    outcome: 'UNRESOLVED',
    policyId: policy.id,
    policyVersion: policy.version,
    durationMonths: months,
    reason: unresolvedReason(months),
    certificateTypes: [],
  };
}

/** Public, read-only description of a policy version (staff screens and the report matrix). */
export const certificateDurationPolicySchema = z
  .object({
    id: z.literal(CERTIFICATE_DURATION_POLICY_ID),
    version: z.number().int().positive(),
    authorityReference: z.string(),
    tiers: z.array(
      z
        .object({
          tier: certificateDurationTierSchema,
          label: z.string(),
          certificateTypes: z.array(certificateTypeSchema).min(1),
        })
        .strict(),
    ),
    unresolved: z.array(
      z.object({ reason: unresolvedDurationReasonSchema, label: z.string() }).strict(),
    ),
    notes: z.array(z.string()),
  })
  .strict();
export type CertificateDurationPolicyView = z.infer<typeof certificateDurationPolicySchema>;

export function describeCertificateDurationPolicy(version?: number): CertificateDurationPolicyView {
  const p = certificateDurationPolicy(version);
  return certificateDurationPolicySchema.parse({
    id: p.id,
    version: p.version,
    authorityReference: p.authorityReference,
    tiers: p.tiers.map((t) => ({
      tier: t.tier,
      label: t.label,
      certificateTypes: [...t.certificateTypes],
    })),
    unresolved: p.unresolved.map((u) => ({ ...u })),
    notes: [...p.notes],
  });
}
