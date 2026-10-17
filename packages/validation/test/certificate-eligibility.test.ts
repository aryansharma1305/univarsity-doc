import { describe, expect, it } from 'vitest';
import {
  ALL_CERTIFICATE_TYPES,
  academicCertificateInputSchema,
  academicCertificatePreviewQuerySchema,
  certificateDurationPolicy,
  certificateTypeSchema,
  describeCertificateDurationPolicy,
  durationInMonths,
  evaluateCourseDuration,
  proposeCertificateEligibilitySchema,
  resolveCourseConfigurationState,
  resolveTypeEligibility,
  studentCertificateEligibilityItemV1Schema,
  submitCertificateRequestSchema,
} from '../src/index.js';

const types = (months: number | null) =>
  months === null
    ? evaluateCourseDuration(null, null).certificateTypes
    : evaluateCourseDuration(months, 'MONTHS').certificateTypes;

describe('university course-duration policy v1', () => {
  it('maps the five synthetic course fixtures exactly as the university stated', () => {
    expect(types(3)).toEqual(['COURSE_COMPLETION']);
    expect(types(6)).toEqual(['COURSE_COMPLETION']);
    expect(types(18)).toEqual(['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER']);
    expect(types(24)).toEqual(['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER']);
    expect(types(36)).toEqual(['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER', 'MIGRATION']);
  });

  it('checks every month from 0 to 60 against the tier boundaries and unresolved cases', () => {
    for (let m = 0; m <= 60; m++) {
      const e = evaluateCourseDuration(m, 'MONTHS');
      if (m === 2 || m === 3 || m === 6) expect(e).toMatchObject({ tier: 'SHORT_COURSE' });
      else if (m > 12 && m <= 24) expect(e).toMatchObject({ tier: 'MORE_THAN_ONE_YEAR' });
      else if (m > 24) expect(e).toMatchObject({ tier: 'MORE_THAN_TWO_YEARS' });
      else {
        expect(e.outcome).toBe('UNRESOLVED');
        expect(e.certificateTypes).toEqual([]);
      }
    }
  });

  it('records each unresolved boundary with its own reason and grants nothing', () => {
    const reason = (v: number | null, u: string | null = 'MONTHS') => {
      const e = evaluateCourseDuration(v, u);
      return e.outcome === 'UNRESOLVED' ? e.reason : e.tier;
    };
    expect(reason(null, null)).toBe('MISSING_DURATION');
    expect(reason(1)).toBe('BELOW_TWO_MONTHS');
    expect(reason(4)).toBe('FOUR_TO_FIVE_MONTHS');
    expect(reason(5)).toBe('FOUR_TO_FIVE_MONTHS');
    for (const m of [7, 8, 9, 10, 11]) expect(reason(m)).toBe('SEVEN_TO_ELEVEN_MONTHS');
    expect(reason(12)).toBe('EXACTLY_TWELVE_MONTHS');
    expect(reason(1, 'YEARS')).toBe('EXACTLY_TWELVE_MONTHS');
  });

  it('treats exactly 2 years as the "more than 1 year" tier and never grants Migration for it', () => {
    for (const e of [evaluateCourseDuration(2, 'YEARS'), evaluateCourseDuration(24, 'MONTHS')]) {
      expect(e).toMatchObject({ outcome: 'TIER', tier: 'MORE_THAN_ONE_YEAR', durationMonths: 24 });
      expect(e.certificateTypes).not.toContain('MIGRATION');
    }
    expect(evaluateCourseDuration(25, 'MONTHS').certificateTypes).toContain('MIGRATION');
    expect(evaluateCourseDuration(3, 'YEARS').certificateTypes).toContain('MIGRATION');
  });

  it('never assumes degree-length courses also receive a Course Completion Certificate', () => {
    for (let m = 7; m <= 240; m++) expect(types(m)).not.toContain('COURSE_COMPLETION');
  });

  it('fails closed on missing, half-missing, malformed and unknown durations', () => {
    expect(durationInMonths(null, 'YEARS')).toBeNull();
    expect(durationInMonths(18, null)).toBeNull();
    expect(durationInMonths(0, 'MONTHS')).toBeNull();
    expect(durationInMonths(-6, 'MONTHS')).toBeNull();
    expect(durationInMonths(1.5, 'YEARS')).toBeNull();
    expect(durationInMonths(18, 'WEEKS')).toBeNull();
    expect(evaluateCourseDuration(18, 'WEEKS')).toMatchObject({
      outcome: 'UNRESOLVED',
      reason: 'MISSING_DURATION',
    });
  });

  it('is a frozen, versioned snapshot whose unknown versions are refused', () => {
    const p = certificateDurationPolicy(1);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.tiers)).toBe(true);
    expect(() => certificateDurationPolicy(2)).toThrow('Unknown');
    expect(evaluateCourseDuration(6, 'MONTHS', 1).policyVersion).toBe(1);
    const view = describeCertificateDurationPolicy();
    view.tiers[0]?.certificateTypes.push('MIGRATION');
    expect(describeCertificateDurationPolicy().tiers[0]?.certificateTypes).toEqual([
      'COURSE_COMPLETION',
    ]);
  });
});

describe('per-type resolution', () => {
  const approved = (certificateTypes: string[], durationMonths: number, policyVersion = 1) => ({
    certificateTypes: certificateTypes.map((t) => certificateTypeSchema.parse(t)),
    durationMonths,
    policyVersion,
  });

  it('keeps permitted types pending until a course configuration is approved', () => {
    const r = resolveTypeEligibility(evaluateCourseDuration(18, 'MONTHS'), null);
    expect(r).toMatchObject({
      TRANSCRIPT: 'PENDING_COURSE_APPROVAL',
      PROVISIONAL: 'PENDING_COURSE_APPROVAL',
      CHARACTER: 'PENDING_COURSE_APPROVAL',
      MIGRATION: 'NOT_OFFERED_FOR_COURSE',
      COURSE_COMPLETION: 'NOT_OFFERED_FOR_COURSE',
    });
  });

  it('approves only the intersection of policy and approved set', () => {
    const e = evaluateCourseDuration(36, 'MONTHS');
    const r = resolveTypeEligibility(e, approved(['TRANSCRIPT', 'MIGRATION'], 36));
    expect(r).toMatchObject({
      TRANSCRIPT: 'APPROVED_FOR_COURSE',
      MIGRATION: 'APPROVED_FOR_COURSE',
      PROVISIONAL: 'NOT_OFFERED_FOR_COURSE',
      COURSE_COMPLETION: 'NOT_OFFERED_FOR_COURSE',
    });
    // A tampered/legacy approved set naming a type outside the tier still grants nothing for it.
    const tampered = resolveTypeEligibility(
      evaluateCourseDuration(18, 'MONTHS'),
      approved(['MIGRATION', 'COURSE_COMPLETION', 'TRANSCRIPT'], 18),
    );
    expect(tampered.MIGRATION).toBe('NOT_OFFERED_FOR_COURSE');
    expect(tampered.COURSE_COMPLETION).toBe('NOT_OFFERED_FOR_COURSE');
    expect(tampered.TRANSCRIPT).toBe('APPROVED_FOR_COURSE');
  });

  it('treats an approval as out of date when the course duration or policy version changes', () => {
    const before = approved(['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER'], 18);
    const changed = evaluateCourseDuration(36, 'MONTHS');
    expect(resolveCourseConfigurationState(changed, before, false)).toBe('OUT_OF_DATE');
    expect(Object.values(resolveTypeEligibility(changed, before))).not.toContain(
      'APPROVED_FOR_COURSE',
    );
    const shortened = evaluateCourseDuration(6, 'MONTHS');
    expect(resolveTypeEligibility(shortened, before).TRANSCRIPT).toBe('NOT_OFFERED_FOR_COURSE');
    const oldPolicy = approved(['TRANSCRIPT'], 18, 99);
    expect(
      resolveCourseConfigurationState(evaluateCourseDuration(18, 'MONTHS'), oldPolicy, true),
    ).toBe('OUT_OF_DATE');
  });

  it('reports every type as unresolved for unresolved durations, even with an approval on file', () => {
    const r = resolveTypeEligibility(
      evaluateCourseDuration(12, 'MONTHS'),
      approved(['TRANSCRIPT'], 12),
    );
    expect(new Set(Object.values(r))).toEqual(new Set(['POLICY_UNRESOLVED']));
    expect(Object.keys(r).sort()).toEqual([...ALL_CERTIFICATE_TYPES].sort());
  });

  it('distinguishes not configured from pending proposals', () => {
    const e = evaluateCourseDuration(3, 'MONTHS');
    expect(resolveCourseConfigurationState(e, null, false)).toBe('NOT_CONFIGURED');
    expect(resolveCourseConfigurationState(e, null, true)).toBe('PENDING_APPROVAL');
    expect(resolveCourseConfigurationState(e, approved(['COURSE_COMPLETION'], 3), true)).toBe(
      'APPROVED',
    );
  });
});

describe('contracts', () => {
  it('rejects client-supplied durations, tiers, policy versions or approval flags in proposals', () => {
    const base = { certificateTypes: ['TRANSCRIPT'], authorityReference: 'Senate resolution 12' };
    expect(proposeCertificateEligibilitySchema.safeParse(base).success).toBe(true);
    for (const extra of [
      { durationMonths: 36 },
      { durationValue: 3, durationUnit: 'YEARS' },
      { tier: 'MORE_THAN_TWO_YEARS' },
      { policyVersion: 1 },
      { status: 'APPROVED' },
      { approved: true },
    ])
      expect(proposeCertificateEligibilitySchema.safeParse({ ...base, ...extra }).success).toBe(
        false,
      );
    expect(
      proposeCertificateEligibilitySchema.safeParse({ ...base, certificateTypes: [] }).success,
    ).toBe(false);
    expect(
      proposeCertificateEligibilitySchema.safeParse({
        ...base,
        certificateTypes: ['TRANSCRIPT', 'TRANSCRIPT'],
      }).success,
    ).toBe(false);
    expect(
      proposeCertificateEligibilitySchema.safeParse({
        ...base,
        certificateTypes: ['TRAINING_CERTIFICATE'],
      }).success,
    ).toBe(false);
  });

  it('keeps COURSE_COMPLETION in the shared application contract without a training alias', () => {
    expect(certificateTypeSchema.options).toContain('COURSE_COMPLETION');
    expect(certificateTypeSchema.options).not.toContain('TRAINING_CERTIFICATE');
    expect(
      submitCertificateRequestSchema.safeParse({
        certificateType: 'COURSE_COMPLETION',
        submissionKey: '0199e3a4-7a1b-7c4d-8e2f-123456789abc',
        purpose: 'Synthetic',
      }).success,
    ).toBe(true);
  });

  it('allows sample previews only for approved course types (UI-05 guard)', () => {
    const item = {
      certificateType: 'MIGRATION',
      typeEligibility: 'NOT_OFFERED_FOR_COURSE',
      samplePreviewAllowed: false,
      samplePreviewTemplate: null,
      applicationAvailability: 'NOT_AVAILABLE',
      courseCompletionStatus: 'NOT_EVALUATED',
      paymentVerification: 'NOT_AVAILABLE',
      rectorApproval: 'NOT_AVAILABLE',
      issuance: 'NOT_AVAILABLE',
    };
    expect(studentCertificateEligibilityItemV1Schema.safeParse(item).success).toBe(true);
    expect(
      studentCertificateEligibilityItemV1Schema.safeParse({
        ...item,
        samplePreviewAllowed: true,
        samplePreviewTemplate: { templateId: 'sample-migration', version: 1 },
      }).success,
    ).toBe(false);
    for (const field of ['rectorApproval', 'issuance', 'paymentVerification'])
      expect(
        studentCertificateEligibilityItemV1Schema.safeParse({ ...item, [field]: 'APPROVED' })
          .success,
      ).toBe(false);
  });

  it('accepts only fictional, credential-free academic preview inputs and queries', () => {
    const valid = {
      type: 'CHARACTER',
      kind: 'SYNTHETIC_PREVIEW',
      institutionName: 'Example University of Learning',
      studentName: 'Alex Sample',
      guardianName: 'Jordan Sample',
      registrationNumber: 'SAMPLE-REG-0001',
      programName: 'Bachelor of Applied Studies',
      issueDate: '2026-06-30',
      certificateReference: 'SAMPLE-CHAR-V1',
      studyPeriodText: '2023 to 2026',
    };
    expect(academicCertificateInputSchema.safeParse(valid).success).toBe(true);
    for (const bad of [
      { registrationNumber: 'REG/2026/001' },
      { institutionName: 'Real University' },
      { kind: 'OFFICIAL' },
      { qrCode: 'abc' },
      { verificationUrl: 'https://example.com' },
      { studentName: '<script>' },
    ])
      expect(academicCertificateInputSchema.safeParse({ ...valid, ...bad }).success).toBe(false);
    expect(
      academicCertificatePreviewQuerySchema.safeParse({
        type: 'TRAINING_CERTIFICATE',
        version: '1',
        fixture: 'standard',
      }).success,
    ).toBe(false);
    expect(
      academicCertificatePreviewQuerySchema.safeParse({
        type: 'MIGRATION',
        version: '2',
        fixture: 'standard',
      }).success,
    ).toBe(false);
  });
});
