import { describe, expect, it } from 'vitest';
import { periodNumbers, periodDisplayLabel } from '../../src/academic/curriculum-periods.js';

describe('legacy academic period visibility', () => {
  it('retains sparse original periods beyond the declaration without inventing intermediate periods', () => {
    expect(
      periodNumbers(2, [
        { semesterNumber: 1 },
        { semesterNumber: 41 },
        { semesterNumber: 41 },
        { semesterNumber: 32767 },
      ]),
    ).toEqual([1, 2, 41, 32767]);
    expect(periodDisplayLabel('SEMESTER_WISE', 41, 2)).toBe(
      'Semester 41 (legacy; outside declared periods)',
    );
  });

  it('keeps declared semester and year labels unchanged', () => {
    expect(periodNumbers(2, [])).toEqual([1, 2]);
    expect(periodDisplayLabel('SEMESTER_WISE', 2, 2)).toBe('Semester 2');
    expect(periodDisplayLabel('YEAR_WISE', 2, 2)).toBe('Year 2');
  });
});
