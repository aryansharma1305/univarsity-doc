import { periodLabel } from '@docversity/validation';

/** Include original legacy placements even when the backfill's declaration was capped. */
export function periodNumbers(count: number, subjects: { semesterNumber: number }[]): number[] {
  return [
    ...new Set([
      ...Array.from({ length: count }, (_, index) => index + 1),
      ...subjects.map((subject) => subject.semesterNumber),
    ]),
  ].sort((a, b) => a - b);
}

export function periodDisplayLabel(
  structure: 'SEMESTER_WISE' | 'YEAR_WISE',
  number: number,
  count: number,
) {
  const label = periodLabel(structure, number);
  return number > count ? `${label} (legacy; outside declared periods)` : label;
}
