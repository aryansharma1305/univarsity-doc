import type { StatusTone } from '@docversity/ui';
import {
  type AcademicStructure,
  type CurriculumStatus,
  type DurationUnit,
  periodUnit,
  type Program,
  type SubjectCategory,
} from '@docversity/validation';

export const STRUCTURE_LABELS: Record<AcademicStructure, string> = {
  SEMESTER_WISE: 'Semester-wise',
  YEAR_WISE: 'Year-wise',
};

export const STRUCTURE_OPTIONS = [
  { value: 'SEMESTER_WISE', label: 'Semester-wise' },
  { value: 'YEAR_WISE', label: 'Year-wise' },
] as const;

export const DURATION_UNIT_OPTIONS = [
  { value: 'YEARS', label: 'Years' },
  { value: 'MONTHS', label: 'Months' },
] as const;

export const CATEGORY_LABELS: Record<SubjectCategory, string> = {
  THEORY: 'Theory',
  PRACTICAL: 'Practical',
  COMBINED: 'Theory + practical',
};

export const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as SubjectCategory[]).map(
  (value) => ({ value, label: CATEGORY_LABELS[value] }),
);

export const CURRICULUM_STATUS: Record<CurriculumStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'success' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

export function durationLabel(value: number | null, unit: DurationUnit | null): string | null {
  if (value === null || unit === null) return null;
  const word = unit === 'YEARS' ? 'year' : 'month';
  return `${String(value)} ${word}${value === 1 ? '' : 's'}`;
}

/** "Semester-wise · 2 semesters" (or null for legacy programs without a structure). */
export function structureLabel(program: Pick<Program, 'academicStructure' | 'periodCount'>) {
  if (!program.academicStructure || program.periodCount === null) return null;
  return `${STRUCTURE_LABELS[program.academicStructure]} · ${periodUnit(program.academicStructure, program.periodCount)}`;
}

export function formatNumber(value: number | null): string {
  return value === null ? '—' : String(value);
}
