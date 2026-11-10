import { z } from 'zod';

const identifier = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/);
const marks = z.string().regex(/^\d{1,5}(\.\d{1,2})?$/);
const credits = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/);
const points = z.string().regex(/^\d{1,2}(\.\d{1,3})?$/);
const grade = z.string().regex(/^[A-Z0-9][A-Z0-9+_-]{0,7}$/);
const componentName = z.enum(['internalMarks', 'externalMarks', 'practicalMarks', 'otherMarks']);

function units(value: string, decimals: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
}

function decimal(value: bigint, places: number): string {
  const scale = 10n ** BigInt(places);
  return `${value / scale}.${(value % scale).toString().padStart(places, '0')}`;
}

const bandSchema = z
  .object({
    minimumPercentBps: z.number().int().min(0).max(10_000),
    grade,
    gradePoint: points,
    passing: z.boolean(),
  })
  .strict();

/** Technical v1 preview contract, never university approval or permission to publish. No defaults. */
export const syntheticGradingPolicySchema = z
  .object({
    contractVersion: z.literal(1),
    usage: z.literal('SYNTHETIC_ONLY'),
    policyId: identifier,
    version: z.number().int().min(1).max(32_767),
    aggregation: z.literal('SUM_COMPONENTS'),
    attemptSelection: z.literal('EXPLICIT'),
    absentHandling: z.literal('WITHHOLD'),
    earnedCreditRule: z.literal('PASS_ONLY'),
    failureOutcome: z.enum(['FAIL', 'BACKLOG']),
    gpaDenominator: z.enum(['ATTEMPTED_CREDITS', 'EARNED_CREDITS']),
    gpaRounding: z.enum(['HALF_UP', 'TRUNCATE']),
    componentFailureGrade: grade,
    componentMinimumPercentBps: z.partialRecord(componentName, z.number().int().min(0).max(10_000)),
    bands: z.array(bandSchema).min(2).max(32),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const labels = new Set<string>();
    for (const [i, band] of policy.bands.entries()) {
      const previous = policy.bands[i - 1];
      if (
        labels.has(band.grade) ||
        (previous && previous.minimumPercentBps <= band.minimumPercentBps)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['bands', i],
          message: 'Use unique descending bands.',
        });
      }
      labels.add(band.grade);
      if (
        !band.passing &&
        points.safeParse(band.gradePoint).success &&
        units(band.gradePoint, 3) !== 0n
      )
        ctx.addIssue({
          code: 'custom',
          path: ['bands', i],
          message: 'Failing grades must carry zero points.',
        });
      if (previous && !previous.passing && band.passing)
        ctx.addIssue({
          code: 'custom',
          path: ['bands', i],
          message: 'Passing bands must precede failing bands.',
        });
      if (
        previous &&
        points.safeParse(previous.gradePoint).success &&
        points.safeParse(band.gradePoint).success &&
        units(previous.gradePoint, 3) < units(band.gradePoint, 3)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['bands', i],
          message: 'Grade points must not increase as marks decrease.',
        });
    }
    if (policy.bands.at(-1)?.minimumPercentBps !== 0)
      ctx.addIssue({ code: 'custom', path: ['bands'], message: 'Bands must cover zero percent.' });
    if (!policy.bands.some((b) => b.passing) || !policy.bands.some((b) => !b.passing))
      ctx.addIssue({
        code: 'custom',
        path: ['bands'],
        message: 'Configure passing and failing bands.',
      });
    if (!policy.bands.some((b) => b.grade === policy.componentFailureGrade && !b.passing))
      ctx.addIssue({
        code: 'custom',
        path: ['componentFailureGrade'],
        message: 'Select an existing failing grade for component failures.',
      });
  });

const componentSchema = z
  .object({ field: componentName, marks: marks.nullable(), maximum: marks })
  .strict()
  .superRefine((component, ctx) => {
    if (!marks.safeParse(component.maximum).success) return;
    const maximum = units(component.maximum, 2);
    if (
      maximum === 0n ||
      (component.marks !== null &&
        marks.safeParse(component.marks).success &&
        units(component.marks, 2) > maximum)
    )
      ctx.addIssue({ code: 'custom', message: 'Require positive maxima and marks within maxima.' });
  });

const subjectSchema = z
  .object({
    programSubjectId: z.uuid(),
    attemptNumber: z.number().int().min(1).max(32_767),
    attendance: z.enum(['PRESENT', 'ABSENT']),
    credits,
    components: z.array(componentSchema).min(1).max(4),
  })
  .strict()
  .superRefine((subject, ctx) => {
    if (new Set(subject.components.map((c) => c.field)).size !== subject.components.length)
      ctx.addIssue({ code: 'custom', path: ['components'], message: 'Duplicate mark component.' });
    if (
      subject.components.some((c) =>
        subject.attendance === 'PRESENT' ? c.marks === null : c.marks !== null,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Present attempts require all marks; absent attempts require null marks.',
      });
    if (
      subject.components.every((c) => marks.safeParse(c.maximum).success) &&
      subject.components.reduce((sum, c) => sum + units(c.maximum, 2), 0n) > 9_999_999n
    )
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Total maximum exceeds result-item storage precision.',
      });
  });

export const syntheticGradingInputSchema = z
  .object({
    registrationId: z.uuid(),
    periodNumber: z.number().int().min(1).max(100),
    subjects: z.array(subjectSchema).min(1).max(500),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.subjects.map((s) => s.programSubjectId)).size !== input.subjects.length)
      ctx.addIssue({
        code: 'custom',
        path: ['subjects'],
        message: 'Select exactly one explicit attempt per subject.',
      });
  });

export type SyntheticGradingPolicy = z.infer<typeof syntheticGradingPolicySchema>;
export type SyntheticGradingInput = z.infer<typeof syntheticGradingInputSchema>;

export const syntheticTranscriptInputSchema = z
  .object({ periods: z.array(syntheticGradingInputSchema).min(1).max(100) })
  .strict()
  .superRefine(({ periods }, ctx) => {
    const registrations = new Set(periods.map((p) => p.registrationId));
    const subjectIds = periods.flatMap((p) => p.subjects.map((s) => s.programSubjectId));
    if (
      registrations.size !== 1 ||
      new Set(periods.map((p) => p.periodNumber)).size !== periods.length ||
      new Set(subjectIds).size !== subjectIds.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Require one registration and unique selected periods/subjects.',
      });
  });

/**
 * Exact fixed-point calculation; no database, grading activation or publication side effects.
 * Missing policy/input is refused. The caller must select authorized attempts explicitly.
 */
export function evaluateSyntheticGrades(policyValue: unknown, inputValue: unknown) {
  const policy = syntheticGradingPolicySchema.parse(policyValue);
  const input = syntheticGradingInputSchema.parse(inputValue);
  const subjects = input.subjects.map((subject) => {
    for (const field of Object.keys(policy.componentMinimumPercentBps)) {
      if (!subject.components.some((c) => c.field === field))
        throw new Error('A policy-required component is missing.');
    }
    const maximum = subject.components.reduce((sum, c) => sum + units(c.maximum, 2), 0n);
    const total = subject.components.reduce(
      (sum, c) => sum + (c.marks === null ? 0n : units(c.marks, 2)),
      0n,
    );
    const base = {
      programSubjectId: subject.programSubjectId,
      attemptNumber: subject.attemptNumber,
      maxMarks: decimal(maximum, 2),
      creditsAttempted: decimal(units(subject.credits, 2), 2),
    };
    if (subject.attendance === 'ABSENT')
      return {
        ...base,
        totalMarks: null,
        grade: null,
        gradePoint: null,
        creditsEarned: '0.00',
        status: 'ABSENT' as const,
      };
    // Compare exact ratios; a rounded percentage can incorrectly cross a grade boundary.
    const band = policy.bands.find((b) => total * 10_000n >= maximum * BigInt(b.minimumPercentBps));
    if (!band) throw new Error('No grade band covers these marks.');
    const componentFailure = subject.components.some((c) => {
      const minimum = policy.componentMinimumPercentBps[c.field];
      return (
        minimum !== undefined &&
        c.marks !== null &&
        units(c.marks, 2) * 10_000n < units(c.maximum, 2) * BigInt(minimum)
      );
    });
    // A component fail cannot inherit a passing grade/points from its aggregate percentage.
    const selected = componentFailure
      ? policy.bands.find((b) => b.grade === policy.componentFailureGrade)
      : band;
    if (!selected) throw new Error('No failing grade is configured.');
    return {
      ...base,
      totalMarks: decimal(total, 2),
      grade: selected.grade,
      gradePoint: decimal(units(selected.gradePoint, 3), 3),
      creditsEarned: selected.passing ? base.creditsAttempted : '0.00',
      status: selected.passing ? ('PASS' as const) : ('FAIL' as const),
    };
  });
  const withheld = subjects.some((s) => s.status === 'ABSENT');
  const sgpa = weightedGpa(policy, subjects);
  return {
    contractVersion: 1 as const,
    usage: 'SYNTHETIC_ONLY' as const,
    officialPublicationAllowed: false as const,
    policySnapshot: policy,
    registrationId: input.registrationId,
    periodNumber: input.periodNumber,
    subjects,
    sgpa,
    outcome: withheld
      ? ('WITHHELD' as const)
      : subjects.some((s) => s.status === 'FAIL')
        ? policy.failureOutcome
        : ('PASS' as const),
  };
}

/** One explicit policy snapshot across explicitly selected periods; never averages rounded SGPAs. */
export function evaluateSyntheticTranscript(policyValue: unknown, inputValue: unknown) {
  const policy = syntheticGradingPolicySchema.parse(policyValue);
  const input = syntheticTranscriptInputSchema.parse(inputValue);
  const periods = input.periods.map((p) => evaluateSyntheticGrades(policy, p));
  const subjects = periods.flatMap((p) => p.subjects);
  return {
    contractVersion: 1 as const,
    usage: 'SYNTHETIC_ONLY' as const,
    officialPublicationAllowed: false as const,
    policySnapshot: policy,
    periods,
    cgpa: weightedGpa(policy, subjects),
    outcome: subjects.some((s) => s.status === 'ABSENT')
      ? ('WITHHELD' as const)
      : subjects.some((s) => s.status === 'FAIL')
        ? policy.failureOutcome
        : ('PASS' as const),
  };
}

function weightedGpa(
  policy: SyntheticGradingPolicy,
  subjects: readonly {
    gradePoint: string | null;
    creditsAttempted: string;
    creditsEarned: string;
    status: string;
  }[],
): string | null {
  const numerator = subjects.reduce(
    (sum, s) =>
      sum + (s.gradePoint === null ? 0n : units(s.gradePoint, 3) * units(s.creditsAttempted, 2)),
    0n,
  );
  const denominator = subjects.reduce(
    (sum, s) =>
      sum +
      units(
        policy.gpaDenominator === 'ATTEMPTED_CREDITS' ? s.creditsAttempted : s.creditsEarned,
        2,
      ),
    0n,
  );
  return subjects.some((s) => s.status === 'ABSENT') || denominator === 0n
    ? null
    : decimal(
        numerator / denominator +
          (policy.gpaRounding === 'HALF_UP' && (numerator % denominator) * 2n >= denominator
            ? 1n
            : 0n),
        3,
      );
}
