import { describe, expect, it } from 'vitest';
import {
  evaluateSyntheticGrades,
  evaluateSyntheticTranscript,
  syntheticGradingInputSchema,
  syntheticGradingPolicySchema,
  type SyntheticGradingInput,
  type SyntheticGradingPolicy,
} from '../src/results/grading.js';

// Deliberately invented technical policy; never a university grading scheme.
function item<T>(items: readonly T[], index = 0): T {
  const value = items[index];
  if (value === undefined) throw new Error('Missing synthetic fixture row.');
  return value;
}

const policy = (): SyntheticGradingPolicy => ({
  contractVersion: 1,
  usage: 'SYNTHETIC_ONLY',
  policyId: 'SAMPLE_GRADING',
  version: 1,
  aggregation: 'SUM_COMPONENTS',
  attemptSelection: 'EXPLICIT',
  absentHandling: 'WITHHOLD',
  earnedCreditRule: 'PASS_ONLY',
  failureOutcome: 'BACKLOG',
  gpaDenominator: 'ATTEMPTED_CREDITS',
  gpaRounding: 'HALF_UP',
  componentFailureGrade: 'F',
  componentMinimumPercentBps: {},
  bands: [
    { minimumPercentBps: 8000, grade: 'A', gradePoint: '9', passing: true },
    { minimumPercentBps: 4000, grade: 'B', gradePoint: '6', passing: true },
    { minimumPercentBps: 0, grade: 'F', gradePoint: '0', passing: false },
  ],
});

const input = (): SyntheticGradingInput => ({
  registrationId: '0199e3a4-7a1b-7c4d-8e2f-123456789abc',
  periodNumber: 1,
  subjects: [
    {
      programSubjectId: '0199e3a4-7a1b-7c4d-8e2f-123456789abd',
      attemptNumber: 2,
      attendance: 'PRESENT',
      credits: '3',
      components: [{ field: 'externalMarks', marks: '80', maximum: '100' }],
    },
  ],
});

describe('synthetic grading foundation', () => {
  it('calculates exact grades/credits while preserving attempt and version, granting no publication', () => {
    expect(evaluateSyntheticGrades(policy(), input())).toMatchObject({
      usage: 'SYNTHETIC_ONLY',
      officialPublicationAllowed: false,
      policySnapshot: { policyId: 'SAMPLE_GRADING', version: 1 },
      sgpa: '9.000',
      outcome: 'PASS',
      subjects: [
        {
          attemptNumber: 2,
          totalMarks: '80.00',
          maxMarks: '100.00',
          grade: 'A',
          gradePoint: '9.000',
          creditsAttempted: '3.00',
          creditsEarned: '3.00',
          status: 'PASS',
        },
      ],
    });
  });

  it.each([
    ['79.99', '100', 'B'],
    ['80', '100', 'A'],
    ['159.99', '200', 'B'],
    ['0', '100', 'F'],
    ['39.99', '100', 'F'],
    ['40', '100', 'B'],
  ])('does not round marks %s/%s across grade boundaries', (marks, maximum, grade) => {
    const v = input();
    item(v.subjects).components[0] = { field: 'externalMarks', marks, maximum };
    expect(evaluateSyntheticGrades(policy(), v).subjects[0]?.grade).toBe(grade);
  });

  it('applies configured component floors and their explicit failing grade despite aggregate pass', () => {
    const p = policy();
    p.componentMinimumPercentBps = { externalMarks: 4000 };
    const v = input();
    item(v.subjects).components = [
      { field: 'externalMarks', marks: '3', maximum: '10' },
      { field: 'internalMarks', marks: '90', maximum: '90' },
    ];
    expect(evaluateSyntheticGrades(p, v)).toMatchObject({
      outcome: 'BACKLOG',
      sgpa: '0.000',
      subjects: [{ totalMarks: '93.00', grade: 'F', creditsEarned: '0.00' }],
    });
    item(v.subjects).components.shift();
    expect(() => evaluateSyntheticGrades(p, v)).toThrow('component is missing');
  });

  it('weights GPA by credits rather than averaging subject points', () => {
    const v = input();
    v.subjects.push({
      ...item(v.subjects),
      programSubjectId: '0199e3a4-7a1b-7c4d-8e2f-123456789abe',
      credits: '1',
      components: [{ field: 'externalMarks', marks: '50', maximum: '100' }],
    });
    expect(evaluateSyntheticGrades(policy(), v).sgpa).toBe('8.250');
  });

  it('uses explicit denominator and failure-outcome choices', () => {
    const p = policy();
    const v = input();
    v.subjects.push({
      ...item(v.subjects),
      programSubjectId: '0199e3a4-7a1b-7c4d-8e2f-123456789abe',
      credits: '1',
      components: [{ field: 'externalMarks', marks: '0', maximum: '100' }],
    });
    expect(evaluateSyntheticGrades(p, v)).toMatchObject({ sgpa: '6.750', outcome: 'BACKLOG' });
    p.gpaDenominator = 'EARNED_CREDITS';
    p.failureOutcome = 'FAIL';
    expect(evaluateSyntheticGrades(p, v)).toMatchObject({ sgpa: '9.000', outcome: 'FAIL' });
  });

  it('rounds exact half ties only as configured without binary floating-point arithmetic', () => {
    const p = policy();
    item(p.bands).gradePoint = '8.002';
    item(p.bands, 1).gradePoint = '8.001';
    const v = input();
    item(v.subjects).credits = '1';
    v.subjects.push({
      ...item(v.subjects),
      programSubjectId: '0199e3a4-7a1b-7c4d-8e2f-123456789abe',
      components: [{ field: 'externalMarks', marks: '50', maximum: '100' }],
    });
    expect(evaluateSyntheticGrades(p, v).sgpa).toBe('8.002');
    p.gpaRounding = 'TRUNCATE';
    expect(evaluateSyntheticGrades(p, v).sgpa).toBe('8.001');
  });

  it('withholds GPA for absence and returns null for zero-credit GPA', () => {
    const v = input();
    item(v.subjects).attendance = 'ABSENT';
    item(item(v.subjects).components).marks = null;
    expect(evaluateSyntheticGrades(policy(), v)).toMatchObject({
      sgpa: null,
      outcome: 'WITHHELD',
      subjects: [{ status: 'ABSENT', grade: null, gradePoint: null, totalMarks: null }],
    });
    item(v.subjects).attendance = 'PRESENT';
    item(item(v.subjects).components).marks = '80';
    item(v.subjects).credits = '0';
    expect(evaluateSyntheticGrades(policy(), v).sgpa).toBeNull();
  });

  it('refuses missing/unknown or official policies without fallback rules', () => {
    for (const p of [
      undefined,
      {},
      { ...policy(), contractVersion: 2 },
      { ...policy(), usage: 'OFFICIAL' },
      { ...policy(), gpaRounding: undefined },
      { ...policy(), extra: true },
    ])
      expect(() => evaluateSyntheticGrades(p, input())).toThrow();
  });

  it('rejects ambiguous/invalid bands and unsupported component-failure grades', () => {
    for (const bands of [
      policy().bands.slice(0, 2),
      [...policy().bands].reverse(),
      [policy().bands[0], policy().bands[0], policy().bands[2]],
      policy().bands.map((b) => ({ ...b, passing: true })),
      policy().bands.map((b) => ({ ...b, gradePoint: '1' })),
    ])
      expect(syntheticGradingPolicySchema.safeParse({ ...policy(), bands }).success).toBe(false);
    expect(
      syntheticGradingPolicySchema.safeParse({ ...policy(), componentFailureGrade: 'A' }).success,
    ).toBe(false);
  });

  it.each(['-1', '1e2', 'NaN', '1.001', '100000', '<script>'])(
    'rejects malformed marks %s',
    (marks) => {
      const v = input();
      item(item(v.subjects).components).marks = marks;
      expect(syntheticGradingInputSchema.safeParse(v).success).toBe(false);
    },
  );

  it('rejects duplicates, missing marks, zero maxima, out-of-bounds totals and identity injection', () => {
    const v = input();
    for (const component of [
      { field: 'externalMarks', marks: null, maximum: '100' },
      { field: 'externalMarks', marks: '101', maximum: '100' },
      { field: 'externalMarks', marks: '0', maximum: '0' },
    ])
      expect(
        syntheticGradingInputSchema.safeParse({
          ...v,
          subjects: [{ ...v.subjects[0], components: [component] }],
        }).success,
      ).toBe(false);
    expect(
      syntheticGradingInputSchema.safeParse({ ...v, subjects: [...v.subjects, ...v.subjects] })
        .success,
    ).toBe(false);
    expect(syntheticGradingInputSchema.safeParse({ ...v, studentId: 'foreign' }).success).toBe(
      false,
    );
    const subject = item(v.subjects);
    expect(
      syntheticGradingInputSchema.safeParse({
        ...v,
        subjects: [{ ...subject, components: [...subject.components, ...subject.components] }],
      }).success,
    ).toBe(false);
    expect(
      syntheticGradingInputSchema.safeParse({
        ...v,
        subjects: [
          {
            ...subject,
            components: [
              { field: 'internalMarks', marks: '0', maximum: '99999.99' },
              { field: 'externalMarks', marks: '0', maximum: '1' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('creates detached snapshots and changes calculation only under an explicitly supplied policy', () => {
    const p = policy();
    const v = input();
    const before = JSON.stringify({ p, v });
    const first = evaluateSyntheticGrades(p, v);
    expect(JSON.stringify({ p, v })).toBe(before);
    p.version = 2;
    item(p.bands).gradePoint = '10';
    expect(first.policySnapshot.version).toBe(1);
    expect(first.policySnapshot.bands[0]?.gradePoint).toBe('9');
    expect(evaluateSyntheticGrades(p, v)).toMatchObject({
      policySnapshot: { version: 2 },
      sgpa: '10.000',
    });
  });

  it('weights CGPA across selected periods instead of averaging their rounded SGPAs', () => {
    const first = input();
    const second = input();
    second.periodNumber = 2;
    item(second.subjects).programSubjectId = '0199e3a4-7a1b-7c4d-8e2f-123456789abe';
    item(second.subjects).credits = '1';
    item(item(second.subjects).components).marks = '50';
    expect(evaluateSyntheticTranscript(policy(), { periods: [first, second] })).toMatchObject({
      officialPublicationAllowed: false,
      cgpa: '8.250',
      outcome: 'PASS',
      periods: [{ sgpa: '9.000' }, { sgpa: '6.000' }],
    });
    second.registrationId = '0199e3a4-7a1b-7c4d-8e2f-123456789abf';
    expect(() => evaluateSyntheticTranscript(policy(), { periods: [first, second] })).toThrow();
    expect(() => evaluateSyntheticTranscript(policy(), { periods: [first, first] })).toThrow();
    expect(() => evaluateSyntheticTranscript(policy(), { periods: [] })).toThrow();
  });
});
