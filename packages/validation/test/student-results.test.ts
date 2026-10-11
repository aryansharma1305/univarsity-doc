import { describe, expect, it } from 'vitest';
import {
  studentResultsPageSchema,
  studentResultsQuerySchema,
} from '../src/results/student-results.js';
const empty = {
  publicationAvailable: false,
  data: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
} as const;
describe('student results release boundary contract', () => {
  it('defaults and bounds pagination without accepting student identity', () => {
    expect(studentResultsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    for (const q of [{ page: 0 }, { pageSize: 101 }, { page: 100001 }, { studentId: 'foreign' }])
      expect(studentResultsQuerySchema.safeParse(q).success).toBe(false);
  });
  it('accepts only an empty, publication-disabled response until provenance is approved', () => {
    expect(studentResultsPageSchema.parse(empty)).toEqual(empty);
    for (const fields of [
      { publicationAvailable: true },
      { data: [{ internalMarks: '75' }] },
      { total: 1 },
      { reviewNotes: 'private' },
      { hasNextPage: true },
    ])
      expect(studentResultsPageSchema.safeParse({ ...empty, ...fields }).success).toBe(false);
  });
});
