import { expect, it } from 'vitest';
import {
  certificateApplicationPolicySchema,
  submitCertificateRequestSchema,
  certificateResponseSchema,
  certificateRequestQuerySchema,
} from '../src/index.js';
const policy = {
  id: 'SYNTHETIC',
  version: 1,
  certificateType: 'TRANSCRIPT',
  authorityReference: 'Synthetic authority',
  approved: true,
  submissionEnabled: true,
  eligibilityRule: 'SYNTHETIC_TEST_ONLY',
  eligibilityReference: 'Synthetic eligible student',
  fields: { purposeRequired: true, remarksAllowed: false },
  evidence: { requirement: 'NONE', authorityReference: 'Synthetic evidence decision' },
  fee: { kind: 'APPROVED_EXEMPTION', authorityReference: 'Synthetic waiver' },
  actions: ['SUBMIT', 'RESPOND'],
};
it('requires a complete approved application contract rather than a broad toggle', () => {
  expect(certificateApplicationPolicySchema.safeParse(policy).success).toBe(true);
  for (const key of [
    'authorityReference',
    'eligibilityRule',
    'eligibilityReference',
    'fee',
    'evidence',
    'actions',
  ]) {
    const incomplete = { ...policy, [key]: undefined };
    expect(certificateApplicationPolicySchema.safeParse(incomplete).success).toBe(false);
  }
  expect(certificateApplicationPolicySchema.safeParse({ ...policy, enabled: true }).success).toBe(
    false,
  );
});
it('rejects unsupported training types, payment flags and arbitrary identities', () => {
  const input = {
    certificateType: 'TRANSCRIPT',
    submissionKey: 'a26e40c6-0946-42cc-99e6-b4a08ecdf32a',
    purpose: 'Study',
  };
  expect(submitCertificateRequestSchema.safeParse(input).success).toBe(true);
  for (const extra of [
    { studentId: 'someone' },
    { certificateType: 'TRAINING_CERTIFICATE' },
    { fee: 3000 },
    { paymentStatus: 'PAID' },
  ])
    expect(submitCertificateRequestSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});
it('bounds follow-up text, rejects internal fields and requires optimistic versions', () => {
  expect(
    certificateResponseSchema.safeParse({ version: 1, message: 'Clarification' }).success,
  ).toBe(true);
  for (const value of [
    { message: 'No version' },
    { version: 1, message: ' ' },
    { version: 1, message: 'x'.repeat(2001) },
    { version: 1, message: 'Reply', privateNote: 'forged' },
  ])
    expect(certificateResponseSchema.safeParse(value).success).toBe(false);
});
it('allows safe filters only, with bounded pagination', () => {
  expect(certificateRequestQuerySchema.parse({}).pageSize).toBe(20);
  for (const value of [
    { pageSize: 1000 },
    { status: 'ISSUED' },
    { studentId: 'unknown' },
    { sortBy: 'raw SQL' },
  ])
    expect(certificateRequestQuerySchema.safeParse(value).success).toBe(false);
});
