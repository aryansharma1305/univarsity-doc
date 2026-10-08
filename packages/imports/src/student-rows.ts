import {
  checkRegistrationRelations,
  type ImportDateFormat,
  type ImportIssue,
  type ImportRowAction,
  type ImportValueMaps,
  normalizeImportValue,
  normalizeRegistrationNumber,
  registrationDatesInOrder,
  registrationNumberSchema,
  type RuleDepartment,
  type RuleProgram,
  type RuleSession,
  STUDENT_IMPORT_FIELDS,
  type StudentImportField,
  type StudentStatus,
  studentImportField,
} from '@docversity/validation';
import type { SourceCell } from './cells.js';
import { parseDateCell } from './dates.js';
import { columnLetter, type SourceRow } from './workbook.js';

/**
 * Pure student-row validation and classification (no database access): the worker loads the
 * reference data and existing registrations in bulk, then calls `validateStudentRows`.
 *
 * Classification of rows without errors:
 *   CREATE — the registration number is new: a new student + registration will be created;
 *   UPDATE — it exists and some SAFE fields differ (see UPDATABLE_FIELDS): shown as a diff and only
 *            applied when the commit explicitly approves updates;
 *   SKIP   — it exists and nothing safe differs.
 * Identity/relationship changes to an existing registration (program, session, department,
 * status) are ERRORS — they are never applied by an import.
 */

export const UPDATABLE_FIELDS: readonly StudentImportField[] = [
  'fullName',
  'fatherName',
  'motherName',
  'dateOfBirth',
  'gender',
  'rollReferenceNumber',
  'admissionDate',
  'completionDate',
];

/** Fields an import may never change on an existing registration. */
export const PROTECTED_FIELDS: readonly StudentImportField[] = [
  'programCode',
  'academicSessionCode',
  'departmentCode',
  'status',
];

const STUDENT_STATUSES: readonly StudentStatus[] = ['ACTIVE', 'COMPLETED', 'SUSPENDED', 'REVOKED'];

export type FieldValues = Partial<Record<StudentImportField, string | null>>;

export interface NormalizedStudentRow {
  values: FieldValues;
  registrationNumberNormalized: string | null;
  programId: string | null;
  academicSessionId: string | null;
  departmentId: string | null;
  studentId: string | null;
  /** Existing registration values at validation time (UPDATE/SKIP); re-checked at commit. */
  current: FieldValues | null;
  changes: { field: StudentImportField; from: string | null; to: string | null }[];
}

export type RawRowData = Record<string, SourceCell>;

export interface StudentRowOutcome {
  rowNumber: number;
  status: 'VALID' | 'WARNING' | 'ERROR';
  action: ImportRowAction | null;
  registrationId: string | null;
  rawData: RawRowData;
  normalizedData: NormalizedStudentRow;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface ExistingRegistration {
  id: string;
  studentId: string;
  registrationNumber: string;
  registrationNumberNormalized: string;
  rollReferenceNumber: string | null;
  program: { id: string; code: string };
  department: { id: string; code: string } | null;
  academicSession: { id: string; code: string };
  admissionDate: string | null;
  completionDate: string | null;
  status: StudentStatus;
  student: {
    fullName: string;
    fatherName: string | null;
    motherName: string | null;
    dateOfBirth: string | null;
    gender: string | null;
  };
}

/** Master data (with names, so course/school names can be matched). */
export interface ReferenceData {
  programs: readonly (RuleProgram & { name: string })[];
  sessions: readonly (RuleSession & { name: string })[];
  departments: readonly (RuleDepartment & { name: string })[];
}

export interface StudentValidationContext {
  references: ReferenceData;
  /** Existing registrations keyed by normalised registration number. */
  existing: ReadonlyMap<string, ExistingRegistration>;
  /**
   * Registrations already using a roll/reference number, keyed by `rollKey(...)`, as sets of
   * normalised registration numbers.
   */
  rollIndex: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface StudentMappingInput {
  columns: Partial<Record<StudentImportField, number | null>>;
  dateFormat: ImportDateFormat;
  valueMaps?: ImportValueMaps;
  defaultAcademicSessionId?: string | null;
}

export function rollKey(programId: string, sessionId: string, roll: string): string {
  return `${programId}|${sessionId}|${roll.trim().toUpperCase()}`;
}

/** The current values of an existing registration in import-field form. */
export function existingValues(existing: ExistingRegistration): FieldValues {
  return {
    registrationNumber: existing.registrationNumber,
    rollReferenceNumber: existing.rollReferenceNumber,
    fullName: existing.student.fullName,
    fatherName: existing.student.fatherName,
    motherName: existing.student.motherName,
    dateOfBirth: existing.student.dateOfBirth,
    gender: existing.student.gender,
    programCode: existing.program.code,
    departmentCode: existing.department?.code ?? null,
    academicSessionCode: existing.academicSession.code,
    admissionDate: existing.admissionDate,
    completionDate: existing.completionDate,
    status: existing.status,
  };
}

// ----------------------------------------------------------------------------------------------

interface RecordIndex<T extends { id: string; code: string; name: string }> {
  byId: Map<string, T>;
  exact: Map<string, T>;
  foldedCode: Map<string, T[]>;
  foldedName: Map<string, T[]>;
}

function indexRecords<T extends { id: string; code: string; name: string }>(
  items: readonly T[],
): RecordIndex<T> {
  const index: RecordIndex<T> = {
    byId: new Map(),
    exact: new Map(),
    foldedCode: new Map(),
    foldedName: new Map(),
  };
  for (const item of items) {
    index.byId.set(item.id, item);
    index.exact.set(item.code, item);
    const code = normalizeImportValue(item.code);
    index.foldedCode.set(code, [...(index.foldedCode.get(code) ?? []), item]);
    const name = normalizeImportValue(item.name);
    index.foldedName.set(name, [...(index.foldedName.get(name) ?? []), item]);
  }
  return index;
}

type Resolution<T> = { kind: 'found'; item: T } | { kind: 'none' } | { kind: 'unknown' };

/**
 * Resolves a cell value to a master record, deterministically:
 *   1. an explicit value map entry chosen by the administrator (null = "none");
 *   2. exact code; 3. code ignoring case/spacing; 4. name ignoring case/spacing —
 * steps 3–4 only when exactly one record matches. Nothing is ever created.
 */
function resolveRecord<T extends { id: string; code: string; name: string }>(
  index: RecordIndex<T>,
  raw: string,
  map: Record<string, string | null> | undefined,
): Resolution<T> {
  const key = normalizeImportValue(raw);
  if (map && Object.prototype.hasOwnProperty.call(map, key)) {
    const id = map[key];
    if (id === null || id === undefined) return { kind: 'none' };
    const item = index.byId.get(id);
    return item ? { kind: 'found', item } : { kind: 'unknown' };
  }
  const exact = index.exact.get(raw.trim());
  if (exact) return { kind: 'found', item: exact };
  for (const candidates of [index.foldedCode.get(key), index.foldedName.get(key)]) {
    if (candidates?.length === 1 && candidates[0]) return { kind: 'found', item: candidates[0] };
  }
  return { kind: 'unknown' };
}

type TextRead = { ok: true; value: string | null } | { ok: false; issue: ImportIssue };

function error(field: StudentImportField | null, code: string, message: string): ImportIssue {
  return { code, severity: 'error', field, message };
}

function warning(field: StudentImportField | null, code: string, message: string): ImportIssue {
  return { code, severity: 'warning', field, message };
}

function readText(cell: SourceCell, field: StudentImportField): TextRead {
  const definition = studentImportField(field);
  let value: string | null;
  switch (cell.type) {
    case 'blank':
      return { ok: true, value: null };
    case 'string':
      value = cell.value.trim();
      break;
    case 'number':
      if (field === 'registrationNumber' && !Number.isSafeInteger(cell.value)) {
        return {
          ok: false,
          issue: error(
            field,
            'INVALID_REGISTRATION_NUMBER',
            'The registration number is a decimal number. Format the column as Text.',
          ),
        };
      }
      value = String(cell.value);
      break;
    case 'formula':
      return {
        ok: false,
        issue: error(
          field,
          'FORMULA_NOT_ALLOWED',
          `${definition.label} contains a formula. Enter the value itself.`,
        ),
      };
    case 'error':
      return {
        ok: false,
        issue: error(
          field,
          'CELL_ERROR',
          `${definition.label} contains an Excel error (${cell.value}).`,
        ),
      };
    case 'boolean':
    case 'date':
      return {
        ok: false,
        issue: error(
          field,
          'INVALID_VALUE',
          `${definition.label} must be text, not a ${cell.type}.`,
        ),
      };
  }
  if (value === '') return { ok: true, value: null };
  if (definition.maxLength !== undefined && value.length > definition.maxLength) {
    return {
      ok: false,
      issue: error(
        field,
        'VALUE_TOO_LONG',
        `${definition.label} is longer than ${definition.maxLength} characters.`,
      ),
    };
  }
  return { ok: true, value };
}

export function relationMessage(
  code: string,
  program: RuleProgram,
  session: RuleSession,
  departmentCode: string | null,
): string {
  switch (code) {
    case 'INACTIVE_PROGRAM':
      return `Program ${program.code} is inactive. Activate it under Programs or use an active program.`;
    case 'ARCHIVED_SESSION':
      return `Academic session ${session.code} is archived. Use another session.`;
    case 'PROGRAM_DEPARTMENT_MISMATCH':
      return `Program ${program.code} belongs to department ${program.department?.code ?? '—'}, not ${departmentCode ?? '—'}. Use ${program.department?.code ?? 'that department'} or leave the department empty.`;
    case 'INACTIVE_DEPARTMENT':
      return `Department ${departmentCode ?? ''} is inactive. Use an active department or leave it empty.`;
    default:
      return `No department with code "${departmentCode ?? ''}" exists. Add it under Departments first, or correct the spreadsheet.`;
  }
}

// ----------------------------------------------------------------------------------------------

/** Validates and classifies every row. Deterministic: same input → same output. */
export function validateStudentRows(
  rows: readonly SourceRow[],
  mapping: StudentMappingInput,
  context: StudentValidationContext,
): StudentRowOutcome[] {
  const programs = indexRecords(context.references.programs);
  const sessions = indexRecords(context.references.sessions);
  const departments = indexRecords(context.references.departments);
  const maps = mapping.valueMaps ?? {};
  const defaultSession = mapping.defaultAcademicSessionId
    ? sessions.byId.get(mapping.defaultAcademicSessionId)
    : undefined;

  const cellOf = (row: SourceRow, field: StudentImportField): SourceCell => {
    const column = mapping.columns[field];
    return column ? (row.cells[column - 1] ?? { type: 'blank' }) : { type: 'blank' };
  };

  // Pass 1: registration numbers in the file (duplicates are errors on every occurrence), which
  // optional columns hold any value at all, and the usual digit count of numeric registration numbers.
  const rowsByRegistration = new Map<string, number[]>();
  const columnHasValues = (field: StudentImportField) =>
    rows.some((row) => cellOf(row, field).type !== 'blank');
  const dateOfBirthInUse = Boolean(mapping.columns.dateOfBirth) && columnHasValues('dateOfBirth');
  const rollInUse =
    Boolean(mapping.columns.rollReferenceNumber) && columnHasValues('rollReferenceNumber');
  const digitCounts = new Map<number, number>();
  for (const row of rows) {
    const cell = cellOf(row, 'registrationNumber');
    if (cell.type === 'number' && Number.isSafeInteger(cell.value)) {
      const digits = String(Math.abs(cell.value)).length;
      digitCounts.set(digits, (digitCounts.get(digits) ?? 0) + 1);
    }
  }
  const usualDigits = [...digitCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
  for (const row of rows) {
    const read = readText(cellOf(row, 'registrationNumber'), 'registrationNumber');
    if (!read.ok || !read.value) continue;
    const parsed = registrationNumberSchema.safeParse(read.value);
    if (!parsed.success) continue;
    const key = normalizeRegistrationNumber(parsed.data);
    rowsByRegistration.set(key, [...(rowsByRegistration.get(key) ?? []), row.rowNumber]);
  }

  // Pass 2: per-row validation. Roll numbers seen in the file are collected for pass 3.
  const outcomes: StudentRowOutcome[] = [];
  const fileRolls = new Map<string, Set<string>>();
  const rollKeyOfRow = new Map<number, string>();

  for (const row of rows) {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const values: FieldValues = {};

    const rawData: RawRowData = {};
    row.cells.forEach((cell, index) => {
      if (cell.type !== 'blank') rawData[columnLetter(index + 1)] = cell;
    });

    // Read every mapped field.
    for (const field of STUDENT_IMPORT_FIELDS) {
      if (!mapping.columns[field.key]) continue;
      const cell = cellOf(row, field.key);
      if (field.kind === 'date') {
        const parsed = parseDateCell(cell, mapping.dateFormat);
        if (parsed.ok) values[field.key] = parsed.value;
        else errors.push(error(field.key, parsed.code, `${field.label}: ${parsed.message}`));
      } else {
        const read = readText(cell, field.key);
        if (read.ok) values[field.key] = read.value;
        else errors.push(read.issue);
      }
    }

    // Registration number.
    let normalized: string | null = null;
    const registrationNumber = values.registrationNumber;
    if (
      registrationNumber === null ||
      (registrationNumber === undefined && !errors.some((e) => e.field === 'registrationNumber'))
    ) {
      errors.push(
        error(
          'registrationNumber',
          'MISSING_REGISTRATION_NUMBER',
          'Registration Number is missing.',
        ),
      );
    } else if (registrationNumber) {
      const parsed = registrationNumberSchema.safeParse(registrationNumber);
      if (parsed.success) {
        normalized = normalizeRegistrationNumber(parsed.data);
        values.registrationNumber = parsed.data;
        const cell = cellOf(row, 'registrationNumber');
        if (
          cell.type === 'number' &&
          usualDigits !== undefined &&
          parsed.data.length < usualDigits
        ) {
          warnings.push(
            warning(
              'registrationNumber',
              'REGISTRATION_NUMBER_MAY_HAVE_LOST_ZEROS',
              `Registration number ${parsed.data} is stored as a number with ${parsed.data.length} digits, while most rows have ${usualDigits}. Excel removes leading zeros from numbers — check it against the original record (format the column as Text).`,
            ),
          );
        }
        const occurrences = rowsByRegistration.get(normalized) ?? [];
        if (occurrences.length > 1) {
          errors.push(
            error(
              'registrationNumber',
              'DUPLICATE_REGISTRATION_IN_FILE',
              `Registration number ${parsed.data} appears more than once in this file (rows ${occurrences.join(', ')}).`,
            ),
          );
        }
      } else {
        errors.push(
          error(
            'registrationNumber',
            'INVALID_REGISTRATION_NUMBER',
            `Registration Number: ${parsed.error.issues[0]?.message ?? 'invalid value.'}`,
          ),
        );
      }
    }

    // Student name.
    if (values.fullName === null || values.fullName === undefined) {
      if (!errors.some((e) => e.field === 'fullName')) {
        errors.push(error('fullName', 'MISSING_STUDENT_NAME', 'Student Name is missing.'));
      }
    }

    // Status.
    let status: StudentStatus | null = null;
    if (values.status) {
      const mapped = maps.status?.[normalizeImportValue(values.status)];
      const upper = (mapped ?? values.status.trim().toUpperCase()) as StudentStatus;
      if (STUDENT_STATUSES.includes(upper)) {
        status = upper;
        values.status = upper;
      } else {
        errors.push(
          error(
            'status',
            'INVALID_STATUS',
            `"${values.status}" is not a status. Use ACTIVE, COMPLETED, SUSPENDED or REVOKED, or translate this value while mapping columns.`,
          ),
        );
      }
    }

    // Master data (resolved by value map, code or name; never created).
    let program: RuleProgram | undefined;
    let session: RuleSession | undefined;
    let department: RuleDepartment | undefined;
    if (values.programCode === null || values.programCode === undefined) {
      if (!errors.some((e) => e.field === 'programCode')) {
        errors.push(error('programCode', 'MISSING_PROGRAM', 'Program Code is missing.'));
      }
    } else {
      const resolved = resolveRecord(programs, values.programCode, maps.programCode);
      if (resolved.kind === 'found') {
        program = resolved.item;
        values.programCode = program.code;
      } else {
        errors.push(
          error(
            'programCode',
            'UNKNOWN_PROGRAM',
            `No program with code or name "${values.programCode}" exists. Add it under Programs, match the value to a program while mapping, or correct the spreadsheet.`,
          ),
        );
      }
    }
    if (values.academicSessionCode === null || values.academicSessionCode === undefined) {
      if (defaultSession) {
        session = defaultSession;
        values.academicSessionCode = defaultSession.code;
      } else if (!errors.some((e) => e.field === 'academicSessionCode')) {
        errors.push(
          error(
            'academicSessionCode',
            'MISSING_ACADEMIC_SESSION',
            'Academic Session Code is missing.',
          ),
        );
      }
    } else {
      const resolved = resolveRecord(
        sessions,
        values.academicSessionCode,
        maps.academicSessionCode,
      );
      if (resolved.kind === 'found') {
        session = resolved.item;
        values.academicSessionCode = session.code;
      } else {
        errors.push(
          error(
            'academicSessionCode',
            'UNKNOWN_SESSION',
            `No academic session with code or name "${values.academicSessionCode}" exists. Add it under Academic sessions, match the value while mapping, or correct the spreadsheet.`,
          ),
        );
      }
    }
    if (values.departmentCode) {
      const resolved = resolveRecord(departments, values.departmentCode, maps.departmentCode);
      if (resolved.kind === 'found') {
        department = resolved.item;
        values.departmentCode = department.code;
      } else if (resolved.kind === 'none') {
        values.departmentCode = null;
      } else {
        errors.push(
          error(
            'departmentCode',
            'UNKNOWN_DEPARTMENT',
            `No department with code or name "${values.departmentCode}" exists. Add it under Departments, match the value while mapping, or correct the spreadsheet.`,
          ),
        );
      }
    }

    const existing = normalized ? context.existing.get(normalized) : undefined;
    const normalizedData: NormalizedStudentRow = {
      values,
      registrationNumberNormalized: normalized,
      programId: program?.id ?? null,
      academicSessionId: session?.id ?? null,
      departmentId: department?.id ?? null,
      studentId: existing?.studentId ?? null,
      current: existing ? existingValues(existing) : null,
      changes: [],
    };
    let action: ImportRowAction | null = null;

    if (existing) {
      // ------------------------------------------------------------- existing registration
      const current = existingValues(existing);
      if (program && program.id !== existing.program.id) {
        errors.push(
          error(
            'programCode',
            'PROGRAM_CHANGE_NOT_ALLOWED',
            `Registration ${existing.registrationNumber} is in program ${existing.program.code}. Imports cannot move it to ${program.code}; change it on the student record if that is intended.`,
          ),
        );
      }
      if (session && session.id !== existing.academicSession.id) {
        errors.push(
          error(
            'academicSessionCode',
            'SESSION_CHANGE_NOT_ALLOWED',
            `Registration ${existing.registrationNumber} is in academic session ${existing.academicSession.code}. Imports cannot change it to ${session.code}.`,
          ),
        );
      }
      if (department && department.id !== existing.department?.id) {
        errors.push(
          error(
            'departmentCode',
            'DEPARTMENT_CHANGE_NOT_ALLOWED',
            `Registration ${existing.registrationNumber} is in department ${existing.department?.code ?? '(none)'}. Imports cannot change it to ${department.code}.`,
          ),
        );
      }
      if (status && status !== existing.status) {
        errors.push(
          error(
            'status',
            'STATUS_CHANGE_NOT_ALLOWED',
            `Registration ${existing.registrationNumber} is ${existing.status}. Imports cannot change its status to ${status}; change it on the student record.`,
          ),
        );
      }
      // Program/session/department are the existing ones (they cannot change).
      normalizedData.programId = existing.program.id;
      normalizedData.academicSessionId = existing.academicSession.id;
      normalizedData.departmentId = existing.department?.id ?? null;

      // Safe fields: a non-blank incoming value that differs is a proposed change. Blank cells never
      // clear stored values.
      for (const field of UPDATABLE_FIELDS) {
        const incoming = values[field];
        if (incoming === undefined || incoming === null) continue;
        if (incoming !== current[field]) {
          normalizedData.changes.push({ field, from: current[field] ?? null, to: incoming });
        }
      }
      const admission = values.admissionDate ?? current.admissionDate ?? null;
      const completion = values.completionDate ?? current.completionDate ?? null;
      if (!registrationDatesInOrder(admission, completion)) {
        errors.push(
          error(
            'completionDate',
            'INVALID_DATE_ORDER',
            'Completion Date is before the Admission Date.',
          ),
        );
      }
      if (existing.status === 'COMPLETED' && !completion) {
        warnings.push(
          warning(
            'completionDate',
            'COMPLETION_DATE_MISSING',
            'The registration is COMPLETED but has no Completion Date.',
          ),
        );
      }
      action = normalizedData.changes.length > 0 ? 'UPDATE' : 'SKIP';
    } else if (program && session) {
      // ------------------------------------------------------------------- new registration
      const relation = checkRegistrationRelations(
        {
          program,
          session,
          departmentId: values.departmentCode ? (department?.id ?? null) : undefined,
          department: department ?? null,
        },
        { program: true, session: true, department: true },
      );
      if (relation.ok) {
        normalizedData.departmentId = relation.departmentId;
        if (relation.departmentId && !values.departmentCode) {
          values.departmentCode = program.department?.code ?? null;
        }
      } else if (!(values.departmentCode && !department)) {
        // (an unknown department code was already reported above)
        errors.push(
          error(
            relation.issue.field === 'program'
              ? 'programCode'
              : relation.issue.field === 'academicSession'
                ? 'academicSessionCode'
                : 'departmentCode',
            relation.issue.code,
            relationMessage(relation.issue.code, program, session, values.departmentCode ?? null),
          ),
        );
      }
      if (!registrationDatesInOrder(values.admissionDate, values.completionDate)) {
        errors.push(
          error(
            'completionDate',
            'INVALID_DATE_ORDER',
            'Completion Date is before the Admission Date.',
          ),
        );
      }
      values.status = status ?? 'ACTIVE';
      // Only when the file normally has dates of birth: a column empty for every row (data not yet
      // collected — students submit it later) produces no warnings at all.
      if (
        dateOfBirthInUse &&
        !values.dateOfBirth &&
        !errors.some((e) => e.field === 'dateOfBirth')
      ) {
        warnings.push(warning('dateOfBirth', 'DATE_OF_BIRTH_MISSING', 'Date of Birth is empty.'));
      }
      if (
        rollInUse &&
        !values.rollReferenceNumber &&
        !errors.some((e) => e.field === 'rollReferenceNumber')
      ) {
        warnings.push(
          warning(
            'rollReferenceNumber',
            'ROLL_REFERENCE_MISSING',
            'Roll / Reference Number is empty.',
          ),
        );
      }
      if (values.status === 'COMPLETED' && !values.completionDate) {
        warnings.push(
          warning(
            'completionDate',
            'COMPLETION_DATE_MISSING',
            'The status is COMPLETED but Completion Date is empty.',
          ),
        );
      }
      action = 'CREATE';
    }

    // Roll / reference number collisions within the same program and session (warning only: the
    // schema does not make roll numbers unique, and their meaning is university-specific).
    const roll = values.rollReferenceNumber;
    if (roll && normalized && normalizedData.programId && normalizedData.academicSessionId) {
      const key = rollKey(normalizedData.programId, normalizedData.academicSessionId, roll);
      rollKeyOfRow.set(row.rowNumber, key);
      fileRolls.set(key, new Set([...(fileRolls.get(key) ?? []), normalized]));
      const inDatabase = context.rollIndex.get(key);
      if (inDatabase && [...inDatabase].some((other) => other !== normalized)) {
        warnings.push(
          warning(
            'rollReferenceNumber',
            'ROLL_REFERENCE_CONFLICT',
            `Roll / Reference Number ${roll} is already used by another registration in the same program and session.`,
          ),
        );
      }
    }

    const hasErrors = errors.length > 0;
    outcomes.push({
      rowNumber: row.rowNumber,
      status: hasErrors ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'VALID',
      action: hasErrors ? null : action,
      registrationId: existing?.id ?? null,
      rawData,
      normalizedData,
      errors,
      warnings,
    });
  }

  // Pass 3: roll numbers shared by different registration numbers within the file.
  for (const outcome of outcomes) {
    const key = rollKeyOfRow.get(outcome.rowNumber);
    if (!key) continue;
    const users = fileRolls.get(key);
    if (
      users &&
      users.size > 1 &&
      !outcome.warnings.some((w) => w.code === 'ROLL_REFERENCE_CONFLICT')
    ) {
      outcome.warnings.push(
        warning(
          'rollReferenceNumber',
          'ROLL_REFERENCE_CONFLICT',
          'The same Roll / Reference Number is used by another registration in this file (same program and session).',
        ),
      );
      if (outcome.status === 'VALID') outcome.status = 'WARNING';
    }
  }
  return outcomes;
}
