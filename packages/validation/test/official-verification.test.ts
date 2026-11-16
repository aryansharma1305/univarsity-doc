import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { attestOfficialResultSchema } from '../src/public-verification/official.js';
it('preserves the database precision for attested marks while keeping GPA precision separate', () => {
  const input = {
    policyId: randomUUID(),
    expectedVersion: 1,
    authorityReference: 'Synthetic university decision',
    outcome: 'PASS',
    totalMarks: '80.12',
    maxMarks: '100',
    sgpa: '9.125',
    cgpa: null,
    subjects: [{ id: randomUUID(), status: 'PASS', grade: 'A' }],
  };
  expect(attestOfficialResultSchema.parse(input).totalMarks).toBe('80.12');
  for (const totalMarks of ['80.125', '99999.999', '100000', '-1'])
    expect(attestOfficialResultSchema.safeParse({ ...input, totalMarks }).success).toBe(false);
  expect(
    attestOfficialResultSchema.safeParse({ ...input, totalMarks: '99999.99', maxMarks: '99999.99' })
      .success,
  ).toBe(true);
});
