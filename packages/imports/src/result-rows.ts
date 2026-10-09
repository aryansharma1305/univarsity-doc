import {
  type ImportIssue,
  type ResultImportField,
  normalizeImportValue,
  normalizeRegistrationNumber,
} from '@docversity/validation';
import type { SourceCell } from './cells.js';
import type { RawRowData } from './student-rows.js';

export type ResultFieldValues = Partial<Record<ResultImportField, string | null>>;

export interface NormalizedResultRow {
  values: ResultFieldValues;
  registrationNumberNormalized: string | null;
  registrationId: string | null;
  programSubjectId: string | null;
}

export interface ResultRowOutcome {
  rowNumber: number;
  status: 'VALID' | 'WARNING' | 'ERROR';
  registrationId: string | null;
  rawData: RawRowData;
  normalizedData: NormalizedResultRow;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface ResultExistingRegistration {
  id: string;
  registrationNumberNormalized: string;
  curriculumId: string | null;
}

export interface ResultProgramSubject {
  id: string;
  curriculumId: string;
  subjectCode: string;
  maxMarks: number | null;
  componentConfiguration?: {
    internalMax?: number | null;
    externalMax?: number | null;
    practicalMax?: number | null;
    otherMax?: number | null;
  } | null;
}

export interface ResultValidationContext {
  registrations: Map<string, ResultExistingRegistration>;
  curriculumSubjects: Map<string, ResultProgramSubject[]>; // Map<curriculumId, ProgramSubject[]>
}

export function parseResultFieldValues(
  rawData: RawRowData,
  mapping: Record<ResultImportField, string | null>
): ResultFieldValues {
  const values: ResultFieldValues = {};
  for (const [field, colKey] of Object.entries(mapping)) {
    if (!colKey) continue;
    const cell = rawData[colKey] as SourceCell | undefined;
    if (cell && cell.type !== 'blank' && cell.type !== 'error') {
      let strValue = '';
      if (cell.type === 'string' || cell.type === 'date') strValue = cell.value;
      else if (cell.type === 'number' || cell.type === 'boolean') strValue = String(cell.value);
      else if (cell.type === 'formula') strValue = cell.result || '';

      if (strValue) {
        const normalized = normalizeImportValue(strValue);
        values[field as ResultImportField] = normalized;
      }
    }
  }
  return values;
}

function parseNumericMark(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function validateResultRows(
  rows: { rowNumber: number; rawData: RawRowData }[],
  mapping: Record<ResultImportField, string | null>,
  context: ResultValidationContext
): ResultRowOutcome[] {
  const outcomes: ResultRowOutcome[] = [];
  const seenSubjectAttempts = new Set<string>();

  for (const row of rows) {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];

    const values = parseResultFieldValues(row.rawData, mapping);

    // 1. Validate Registration Number
    const rawRegNum = values.registrationNumber;
    let registrationNumberNormalized: string | null = null;
    let registration: ResultExistingRegistration | null = null;

    if (!rawRegNum) {
      errors.push({ field: 'registrationNumber', code: 'REQUIRED', message: 'Registration number is missing.' });
    } else {
      registrationNumberNormalized = normalizeRegistrationNumber(rawRegNum);
      registration = context.registrations.get(registrationNumberNormalized) || null;
      if (!registration) {
        errors.push({
          field: 'registrationNumber',
          code: 'REGISTRATION_NOT_FOUND',
          message: `Registration number '${rawRegNum}' not found in the database.`,
        });
      }
    }

    // 2. Validate Subject Code
    const rawSubject = values.subjectCode;
    let programSubject: ResultProgramSubject | null = null;

    if (!rawSubject) {
      errors.push({ field: 'subjectCode', code: 'REQUIRED', message: 'Subject code is missing.' });
    } else if (registration) {
      if (!registration.curriculumId) {
        errors.push({
          field: 'subjectCode',
          code: 'CURRICULUM_NOT_ASSIGNED',
          message: `Student '${rawRegNum}' does not have an assigned curriculum version.`,
        });
      } else {
        const curriculumSubjects = context.curriculumSubjects.get(registration.curriculumId) || [];
        const matchingSubjects = curriculumSubjects.filter(
          (s) => s.subjectCode.toUpperCase() === rawSubject.trim().toUpperCase()
        );

        if (matchingSubjects.length === 0) {
          errors.push({
            field: 'subjectCode',
            code: 'SUBJECT_NOT_FOUND',
            message: `Subject code '${rawSubject}' is not part of the student's assigned curriculum.`,
          });
        } else if (matchingSubjects.length > 1) {
          errors.push({
            field: 'subjectCode',
            code: 'SUBJECT_AMBIGUOUS',
            message: `Subject code '${rawSubject}' is ambiguous in the curriculum.`,
          });
        } else {
          programSubject = matchingSubjects[0];
        }
      }
    }

    // 3. Duplicate checks within file
    if (registrationNumberNormalized && programSubject) {
      const attemptKey = `${registrationNumberNormalized}:${programSubject.id}`;
      if (seenSubjectAttempts.has(attemptKey)) {
        errors.push({
          field: 'subjectCode',
          code: 'DUPLICATE_ROW',
          message: `Duplicate entry for student and subject in this import.`,
        });
      }
      seenSubjectAttempts.add(attemptKey);
    }

    // 4. Validate marks values and max boundaries
    const marksFields: { key: ResultImportField; maxKey: keyof NonNullable<ResultProgramSubject['componentConfiguration']> | 'maxMarks' }[] = [
      { key: 'internalMarks', maxKey: 'internalMax' },
      { key: 'externalMarks', maxKey: 'externalMax' },
      { key: 'practicalMarks', maxKey: 'practicalMax' },
      { key: 'otherMarks', maxKey: 'otherMax' },
      { key: 'totalMarks', maxKey: 'maxMarks' },
    ];

    for (const { key, maxKey } of marksFields) {
      const markStr = values[key];
      if (markStr) {
        const mark = parseNumericMark(markStr);
        if (mark === null) {
          errors.push({
            field: key,
            code: 'INVALID_NUMBER',
            message: `Value '${markStr}' is not a valid number.`,
          });
        } else if (mark < 0) {
          errors.push({
            field: key,
            code: 'NEGATIVE_MARKS_NOT_ALLOWED',
            message: `Marks cannot be negative.`,
          });
        } else if (programSubject) {
          let max: number | null | undefined = null;
          if (maxKey === 'maxMarks') {
            max = programSubject.maxMarks;
          } else if (programSubject.componentConfiguration) {
            max = programSubject.componentConfiguration[maxKey];
          }

          if (max !== null && max !== undefined && mark > max) {
            errors.push({
              field: key,
              code: 'EXCEEDS_MAX_MARKS',
              message: `Marks (${mark}) exceed the configured maximum (${max}) for this component.`,
            });
          }
        }
      }
    }

    // At least one mark or grade should be provided
    const hasAnyMark = marksFields.some((f) => values[f.key] != null);
    const hasGrade = values.grade != null;
    if (!hasAnyMark && !hasGrade) {
      errors.push({
        field: 'totalMarks',
        code: 'NO_MARKS_OR_GRADE',
        message: 'A row must contain at least one marks component or a grade.',
      });
    }

    outcomes.push({
      rowNumber: row.rowNumber,
      status: errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'VALID',
      registrationId: registration?.id || null,
      rawData: row.rawData,
      normalizedData: {
        values,
        registrationNumberNormalized,
        registrationId: registration?.id || null,
        programSubjectId: programSubject?.id || null,
      },
      errors,
      warnings,
    });
  }

  return outcomes;
}
