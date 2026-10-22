import { expect, it } from 'vitest';
import {
  publicVerificationRequestSchema,
  normalizeVerificationReference,
  unavailableVerificationResponseSchema,
  PUBLIC_VERIFICATION_UNAVAILABLE,
} from '../src/public-verification/schemas.js';
it('normalizes Unicode formatting while preserving opaque credential case', () => {
  const input = publicVerificationRequestSchema.parse({
    contractVersion: 1,
    reference: '  Ａbc-123  ',
  });
  expect(input.reference).toBe('Abc-123');
  expect(normalizeVerificationReference('registration', input.reference)).toBe('ABC-123');
  expect(normalizeVerificationReference('result', input.reference)).toBe('ABC-123');
  expect(normalizeVerificationReference('certificate', input.reference)).toBe('Abc-123');
  expect(normalizeVerificationReference('admission-letter', input.reference)).toBe('Abc-123');
});
it.each([
  '',
  'a',
  'a'.repeat(129),
  'https://evil.invalid',
  '../secret?x=1',
  '<script>',
  'a b',
  'a\nb',
])('rejects unsafe or unbounded input %j', (reference) => {
  expect(publicVerificationRequestSchema.safeParse({ contractVersion: 1, reference }).success).toBe(
    false,
  );
});
it('does not admit success or extra disclosure fields in the fail-closed response', () => {
  const response = {
    contractVersion: 1,
    service: 'result',
    status: 'UNAVAILABLE',
    message: PUBLIC_VERIFICATION_UNAVAILABLE,
  };
  expect(unavailableVerificationResponseSchema.safeParse(response).success).toBe(true);
  expect(
    unavailableVerificationResponseSchema.safeParse({ ...response, status: 'VERIFIED' }).success,
  ).toBe(false);
  expect(
    unavailableVerificationResponseSchema.safeParse({ ...response, fullName: 'Synthetic' }).success,
  ).toBe(false);
});
