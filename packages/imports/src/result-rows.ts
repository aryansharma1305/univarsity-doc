import {
  type ImportIssue,
  type ResultImportField,
  normalizeImportValue,
  normalizeRegistrationNumber,
} from '@docversity/validation';
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
  academicPeriod: string;
  maxMarks: number | null;
  componentConfiguration?: {
    internalMax?: number | null;
    internalRequired?: boolean;
    externalMax?: number | null;
    externalRequired?: boolean;
    practicalMax?: number | null;
    practicalRequired?: boolean;
    otherMax?: number | null;
    otherRequired?: boolean;
  } | null;
}

export interface ResultValidationContext {
  registrations: Map<string, ResultExistingRegistration>;
  curriculumSubjects: Map<string, ResultProgramSubject[]>; // Map<curriculumId, ProgramSubject[]>
  academicPeriod: string;
  examinationContext?: {
    examinationId: string;
    attemptNumber: number;
  };
}

export function parseResultFieldValues(
  rawData: RawRowData,
  mapping: Record<ResultImportField, string | null>,
): ResultFieldValues {
  const values: ResultFieldValues = {};
  for (const [field, colKey] of Object.entries(mapping)) {
    if (!colKey) continue;
    const cell = rawData[colKey];
    if (cell && cell.type !== 'blank' && cell.type !== 'error') {
      let strValue = '';
      if (cell.type === 'string' || cell.type === 'date') strValue = cell.value;
      else if (cell.type === 'number' || cell.type === 'boolean') strValue = String(cell.value);
      else strValue = cell.result ?? '';

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
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || Math.abs(parsed) >= 10000) return null;
  return parsed;
}

export function validateResultRows(
  rows: { rowNumber: number; rawData: RawRowData }[],
  mapping: Record<ResultImportField, string | null>,
  context: ResultValidationContext,
): ResultRowOutcome[] {
  if (!context.academicPeriod || context.academicPeriod.trim() === '') {
    throw new Error('Academic period context is missing, empty, or invalid.');
  }

  if (
    ![...context.curriculumSubjects.values()].some((subjects) =>
      subjects.some((subject) => subject.academicPeriod === context.academicPeriod),
    )
  ) {
    throw new Error('Academic period does not exist in the loaded curriculum structure.');
  }

  if (context.examinationContext) {
    const attempt = context.examinationContext.attemptNumber;
    if (
      !context.examinationContext.examinationId ||
      typeof attempt !== 'number' ||
      !Number.isFinite(attempt) ||
      !Number.isSafeInteger(attempt) ||
      attempt < 1
    ) {
      throw new Error(
        'Examination context is invalid. Ensure examinationId and attemptNumber are explicitly provided and safe integers.',
      );
    }
  }

  const outcomes: ResultRowOutcome[] = [];
  const seenSubjectAttempts = new Set<string>();

  for (const row of rows) {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];

    const values = parseResultFieldValues(row.rawData, mapping);

    // 1. Validate Registration Number
    const rawRegNum = values.registrationNumber;
    const rawRegNumCell = mapping.registrationNumber
      ? row.rawData[mapping.registrationNumber]
      : null;
    let registrationNumberNormalized: string | null = null;
    let registration: ResultExistingRegistration | null = null;

    if (!rawRegNum) {
      errors.push({
        severity: 'error',
        field: 'registrationNumber',
        code: 'REQUIRED',
        message: 'Registration number is missing.',
      });
    } else if (rawRegNumCell?.type === 'number') {
      errors.push({
        severity: 'error',
        field: 'registrationNumber',
        code: 'NUMERIC_REGISTRATION',
        message: 'Registration number must be formatted as text to preserve leading zeros.',
      });
    } else if (rawRegNumCell?.type === 'formula') {
      errors.push({
        severity: 'error',
        field: 'registrationNumber',
        code: 'FORMULA_REGISTRATION',
        message: 'Registration number cannot be computed by a formula.',
      });
    } else {
      registrationNumberNormalized = normalizeRegistrationNumber(rawRegNum);
      registration = context.registrations.get(registrationNumberNormalized) ?? null;
      if (!registration) {
        errors.push({
          severity: 'error',
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
      errors.push({
        severity: 'error',
        field: 'subjectCode',
        code: 'REQUIRED',
        message: 'Subject code is missing.',
      });
    } else if (registration) {
      if (!registration.curriculumId) {
        errors.push({
          severity: 'error',
          field: 'subjectCode',
          code: 'CURRICULUM_NOT_ASSIGNED',
          message: `Student '${rawRegNum}' does not have an assigned curriculum version.`,
        });
      } else {
        const curriculumSubjects = context.curriculumSubjects.get(registration.curriculumId) ?? [];
        const isPeriodValidForCurriculum = curriculumSubjects.some(
          (s) => s.academicPeriod === context.academicPeriod,
        );

        if (!isPeriodValidForCurriculum) {
          errors.push({
            severity: 'error',
            field: 'subjectCode',
            code: 'INVALID_PERIOD_FOR_CURRICULUM',
            message: `The imported academic period (${context.academicPeriod}) is not valid for the student's assigned curriculum.`,
          });
        } else {
          const matchingSubjects = curriculumSubjects.filter(
            (s) => s.subjectCode.toUpperCase() === rawSubject.trim().toUpperCase(),
          );

          if (matchingSubjects.length === 0) {
            errors.push({
              severity: 'error',
              field: 'subjectCode',
              code: 'SUBJECT_NOT_FOUND',
              message: `Subject code '${rawSubject}' is not part of the student's assigned curriculum.`,
            });
          } else if (matchingSubjects.length > 1) {
            errors.push({
              severity: 'error',
              field: 'subjectCode',
              code: 'SUBJECT_AMBIGUOUS',
              message: `Subject code '${rawSubject}' is ambiguous in the curriculum.`,
            });
          } else {
            programSubject = matchingSubjects[0] ?? null;
            if (programSubject && programSubject.academicPeriod !== context.academicPeriod) {
              errors.push({
                severity: 'error',
                field: 'subjectCode',
                code: 'SUBJECT_PERIOD_MISMATCH',
                message: `Subject '${rawSubject}' does not belong to the selected academic period (${context.academicPeriod}).`,
              });
            }
          }
        }
      }
    }

    // 3. Duplicate checks within file
    if (registrationNumberNormalized && programSubject) {
      let attemptKey = `${registrationNumberNormalized}:${programSubject.id}`;
      if (context.examinationContext) {
        attemptKey += `:${context.examinationContext.examinationId}:${context.examinationContext.attemptNumber}`;
      }
      if (seenSubjectAttempts.has(attemptKey)) {
        errors.push({
          severity: 'error',
          field: 'subjectCode',
          code: 'DUPLICATE_ROW',
          message: `Duplicate entry for student and subject in this import.`,
        });
      }
      seenSubjectAttempts.add(attemptKey);
    }

    // 4. Validate marks values and max boundaries
    const marksFields: {
      key: ResultImportField;
      maxKey: keyof NonNullable<ResultProgramSubject['componentConfiguration']> | 'maxMarks';
      requiredKey?: keyof NonNullable<ResultProgramSubject['componentConfiguration']>;
    }[] = [
      { key: 'internalMarks', maxKey: 'internalMax', requiredKey: 'internalRequired' },
      { key: 'externalMarks', maxKey: 'externalMax', requiredKey: 'externalRequired' },
      { key: 'practicalMarks', maxKey: 'practicalMax', requiredKey: 'practicalRequired' },
      { key: 'otherMarks', maxKey: 'otherMax', requiredKey: 'otherRequired' },
      { key: 'totalMarks', maxKey: 'maxMarks' },
    ];

    for (const { key, maxKey, requiredKey } of marksFields) {
      const markStr = values[key];
      if (markStr) {
        const mark = parseNumericMark(markStr);
        if (mark === null) {
          errors.push({
            severity: 'error',
            field: key,
            code: 'INVALID_NUMBER',
            message: `Value '${markStr}' is not a valid number.`,
          });
        } else if (mark < 0) {
          errors.push({
            severity: 'error',
            field: key,
            code: 'NEGATIVE_MARKS_NOT_ALLOWED',
            message: `Marks cannot be negative.`,
          });
        } else if (programSubject) {
          let max: number | null | undefined = null;
          if (maxKey === 'maxMarks') {
            max = programSubject.maxMarks;
          } else if (programSubject.componentConfiguration) {
            max = programSubject.componentConfiguration[maxKey] as number | null | undefined;
          }

          if (max !== null && max !== undefined && mark > max) {
            errors.push({
              severity: 'error',
              field: key,
              code: 'EXCEEDS_MAX_MARKS',
              message: `Marks (${mark}) exceed the configured maximum (${max}) for this component.`,
            });
          }
        }
      } else if (programSubject?.componentConfiguration && requiredKey) {
        const isRequired = programSubject.componentConfiguration[requiredKey];
        if (isRequired) {
          errors.push({
            severity: 'error',
            field: key,
            code: 'REQUIRED_COMPONENT_MISSING',
            message: `Marks component '${key}' is required by the curriculum.`,
          });
        }
      }
    }

    // At least one mark component should be provided
    const hasAnyMark = marksFields.some((f) => values[f.key] != null);
    const hasGrade = values.grade != null;
    if (!hasAnyMark) {
      if (hasGrade) {
        errors.push({
          severity: 'error',
          field: 'grade',
          code: 'GRADE_ONLY_IMPORT_NOT_ALLOWED',
          message:
            'Grade-only imports are not approved. A row must contain at least one marks component.',
        });
      } else {
        errors.push({
          severity: 'error',
          field: 'totalMarks',
          code: 'NO_MARKS',
          message: 'A row must contain at least one marks component.',
        });
      }
    }

    outcomes.push({
      rowNumber: row.rowNumber,
      status: errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'VALID',
      registrationId: registration?.id ?? null,
      rawData: row.rawData,
      normalizedData: {
        values,
        registrationNumberNormalized,
        registrationId: registration?.id ?? null,
        programSubjectId: programSubject?.id ?? null,
      },
      errors,
      warnings,
    });
  }

  return outcomes;
}
