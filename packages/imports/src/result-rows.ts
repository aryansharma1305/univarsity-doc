import {
  type ImportIssue,
  type ResultImportField,
  normalizeImportHeader,
  normalizeImportValue,
  normalizeRegistrationNumber,
  resultImportField,
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
  /** Registration status; anything other than ACTIVE produces a warning (when provided). */
  status?: string;
}

export interface ResultProgramSubject {
  id: string;
  /** Display name of the subject (preview only). */
  subjectName?: string;
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
  /**
   * The curriculum version selected for the import. A registration assigned to another version is
   * rejected (CURRICULUM_MISMATCH) instead of being validated against the wrong syllabus.
   */
  expectedCurriculumId?: string;
  /** Registrations that already have a result for the selected examination (warning only). */
  registrationsWithResults?: ReadonlySet<string>;
  /**
   * Whether a grade column may be imported. `false` = grades are not accepted by university policy
   * yet: a grade next to marks is reported as a warning and ignored. Undefined = not checked.
   */
  gradesAccepted?: boolean;
}

const RESULT_FIELD_LABELS: Record<ResultImportField, string> = {
  registrationNumber: 'Registration number',
  subjectCode: 'Subject code',
  internalMarks: 'Internal marks',
  externalMarks: 'External marks',
  practicalMarks: 'Practical marks',
  otherMarks: 'Other marks',
  totalMarks: 'Total marks',
  grade: 'Grade',
};

/**
 * Cells that can never be read as values: formulas (official marks must be typed, not computed —
 * Excel's cached result is never used) and Excel error values such as #N/A or #REF!.
 */
export function unreadableResultCells(
  rawData: RawRowData,
  mapping: Partial<Record<ResultImportField, string | null>>,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  for (const [field, colKey] of Object.entries(mapping) as [ResultImportField, string | null][]) {
    if (!colKey) continue;
    const cell = rawData[colKey];
    // The registration number has its own, more specific formula check.
    if (cell?.type === 'formula' && field !== 'registrationNumber') {
      issues.push({
        severity: 'error',
        field,
        code: 'FORMULA_NOT_ALLOWED',
        message: `${RESULT_FIELD_LABELS[field]} is calculated by a formula. Enter the value itself.`,
      });
    } else if (cell?.type === 'error') {
      issues.push({
        severity: 'error',
        field,
        code: 'INVALID_CELL',
        message: `${RESULT_FIELD_LABELS[field]} contains the Excel error ${cell.value}.`,
      });
    }
  }
  return issues;
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
      // Formula cells: the cached result is never used (reported by `unreadableResultCells`), except
      // for the registration number, whose dedicated check needs to know a value was present.
      else strValue = field === 'registrationNumber' ? (cell.result ?? `=${cell.formula}`) : '';

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
    errors.push(...unreadableResultCells(row.rawData, mapping));

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
          message: `Registration number '${rawRegNum}' is not registered in the selected course.`,
        });
      } else if (
        context.expectedCurriculumId &&
        registration.curriculumId &&
        registration.curriculumId !== context.expectedCurriculumId
      ) {
        errors.push({
          severity: 'error',
          field: 'registrationNumber',
          code: 'CURRICULUM_MISMATCH',
          message: `Student '${rawRegNum}' follows a different curriculum version than the one selected.`,
        });
      }
      if (registration?.status !== undefined && registration.status !== 'ACTIVE') {
        warnings.push({
          severity: 'warning',
          field: 'registrationNumber',
          code: 'REGISTRATION_NOT_ACTIVE',
          message: `The registration status is ${registration.status}. Check before results are recorded.`,
        });
      }
      if (registration && context.registrationsWithResults?.has(registration.id)) {
        warnings.push({
          severity: 'warning',
          field: 'registrationNumber',
          code: 'EXISTING_RESULT',
          message:
            'A result already exists for this student and examination. A later import would need an explicit revision decision.',
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
    } else if (registration && !errors.some((issue) => issue.code === 'CURRICULUM_MISMATCH')) {
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
            message: `Value '${markStr}' is not a valid mark. Use a number with at most 2 decimal places.`,
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

    if (hasGrade && hasAnyMark && context.gradesAccepted === false) {
      warnings.push({
        severity: 'warning',
        field: 'grade',
        code: 'GRADE_NOT_ACCEPTED',
        message:
          'Grades are not accepted by university policy yet. The grade is ignored; only marks are read.',
      });
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

const COMPONENT_FIELD_KEYS = {
  internalMarks: 'internal',
  externalMarks: 'external',
  practicalMarks: 'practical',
  otherMarks: 'other',
} as const;

/**
 * Translates a curriculum assignment's assessment components — stored by Phase 7B as
 * `{ components: [{ name, maxMarks, passMarks }] }` with free-text names — into the component
 * configuration the validator checks. A component is recognised only when its normalised name is
 * exactly the label or an alias of a marks field (e.g. "Internal", "Theory" → external, "Viva" →
 * other); a recognised component is required and its maximum is enforced. Names that match no field,
 * or several components matching the same field, are returned as `unrecognized` and never guessed.
 */
export function componentConfigurationFromCurriculum(value: unknown): {
  configuration: ResultProgramSubject['componentConfiguration'];
  unrecognized: string[];
} {
  const list =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { components?: unknown }).components
      : undefined;
  if (!Array.isArray(list) || list.length === 0) return { configuration: null, unrecognized: [] };

  const byField = new Map<
    keyof typeof COMPONENT_FIELD_KEYS,
    { name: string; maxMarks: number }[]
  >();
  const unrecognized: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { name, maxMarks } = item as { name?: unknown; maxMarks?: unknown };
    if (typeof name !== 'string' || typeof maxMarks !== 'number') continue;
    const normalized = normalizeImportHeader(name);
    const field = (Object.keys(COMPONENT_FIELD_KEYS) as (keyof typeof COMPONENT_FIELD_KEYS)[]).find(
      (key) => {
        const definition = resultImportField(key);
        return (
          definition !== undefined &&
          (normalizeImportHeader(definition.label) === normalized ||
            definition.aliases.includes(normalized))
        );
      },
    );
    if (!field) {
      unrecognized.push(name);
      continue;
    }
    byField.set(field, [...(byField.get(field) ?? []), { name, maxMarks }]);
  }

  const configuration: NonNullable<ResultProgramSubject['componentConfiguration']> = {};
  for (const [field, matches] of byField) {
    if (matches.length > 1) {
      unrecognized.push(...matches.map((match) => match.name));
      continue;
    }
    const key = COMPONENT_FIELD_KEYS[field];
    configuration[`${key}Max`] = matches[0]?.maxMarks ?? null;
    configuration[`${key}Required`] = true;
  }
  return {
    configuration: Object.keys(configuration).length > 0 ? configuration : null,
    unrecognized,
  };
}
