import { describe, expect, it } from 'vitest';
import {
  rollKey,
  type SourceCell,
  type SourceRow,
  type StudentValidationContext,
  validateStudentRows,
} from '../src/index.js';
import {
  ARCHIVED,
  DEPT,
  INACTIVE_PROGRAM,
  LOOSE,
  MBA,
  OTHER_SESSION,
  PROGRAM,
  REFERENCES,
  SESSION,
  existingRegistration,
} from './helpers.js';

const FIELDS = [
  'registrationNumber',
  'rollReferenceNumber',
  'fullName',
  'fatherName',
  'motherName',
  'dateOfBirth',
  'gender',
  'programCode',
  'departmentCode',
  'academicSessionCode',
  'admissionDate',
  'completionDate',
  'status',
] as const;
type Field = (typeof FIELDS)[number];
const MAPPING = {
  columns: Object.fromEntries(FIELDS.map((field, index) => [field, index + 1])),
  dateFormat: 'ISO' as const,
};

function cell(value: unknown): SourceCell {
  if (value === undefined || value === null || value === '') return { type: 'blank' };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'object') return value as SourceCell;
  return { type: 'string', value: value as string };
}

let nextRow = 2;
function row(values: Partial<Record<Field, unknown>>): SourceRow {
  return { rowNumber: nextRow++, cells: FIELDS.map((field) => cell(values[field])) };
}

const VALID = {
  registrationNumber: 'DEV-IMPORT-0001',
  rollReferenceNumber: 'DEV-ROLL-0001',
  fullName: 'Test Student One',
  dateOfBirth: '2004-01-15',
  programCode: PROGRAM.code,
  academicSessionCode: SESSION.code,
};

function context(overrides: Partial<StudentValidationContext> = {}): StudentValidationContext {
  return { references: REFERENCES, existing: new Map(), rollIndex: new Map(), ...overrides };
}

function codes(outcome: { errors: { code: string }[]; warnings: { code: string }[] } | undefined) {
  return {
    errors: outcome?.errors.map((e) => e.code) ?? [],
    warnings: outcome?.warnings.map((w) => w.code) ?? [],
  };
}

describe('student row validation', () => {
  it('accepts a valid new row and classifies it CREATE (department derived from the program)', () => {
    const [outcome] = validateStudentRows([row(VALID)], MAPPING, context());
    expect(outcome).toMatchObject({ status: 'VALID', action: 'CREATE', registrationId: null });
    expect(outcome?.normalizedData).toMatchObject({
      registrationNumberNormalized: 'DEV-IMPORT-0001',
      programId: PROGRAM.id,
      academicSessionId: SESSION.id,
      departmentId: DEPT.id,
      values: { departmentCode: DEPT.code, status: 'ACTIVE', dateOfBirth: '2004-01-15' },
    });
    // The source row is kept as read.
    expect(outcome?.rawData.A).toEqual({ type: 'string', value: 'DEV-IMPORT-0001' });
  });

  it('reports missing required values', () => {
    const [outcome] = validateStudentRows([row({})], MAPPING, context());
    expect(outcome?.status).toBe('ERROR');
    expect(outcome?.action).toBeNull();
    expect(codes(outcome).errors).toEqual([
      'MISSING_REGISTRATION_NUMBER',
      'MISSING_STUDENT_NAME',
      'MISSING_PROGRAM',
      'MISSING_ACADEMIC_SESSION',
    ]);
  });

  it('rejects unknown master data instead of creating it', () => {
    const [outcome] = validateStudentRows(
      [row({ ...VALID, programCode: 'NOPE', academicSessionCode: 'NONE', departmentCode: 'NADA' })],
      MAPPING,
      context(),
    );
    expect(codes(outcome).errors).toEqual([
      'UNKNOWN_PROGRAM',
      'UNKNOWN_SESSION',
      'UNKNOWN_DEPARTMENT',
    ]);
  });

  it('matches codes case-insensitively when unambiguous', () => {
    const [outcome] = validateStudentRows(
      [row({ ...VALID, programCode: 'dev-btech-cse' })],
      MAPPING,
      context(),
    );
    expect(outcome?.status).toBe('VALID');
    expect(outcome?.normalizedData.values.programCode).toBe(PROGRAM.code);
  });

  it('applies the shared registration relation rules (inactive program, archived session, mismatch)', () => {
    const outcomes = validateStudentRows(
      [
        row({ ...VALID, registrationNumber: 'A1', programCode: INACTIVE_PROGRAM.code }),
        row({ ...VALID, registrationNumber: 'A2', academicSessionCode: ARCHIVED.code }),
        row({ ...VALID, registrationNumber: 'A3', departmentCode: 'DEV-MBA-DEPT' }),
        row({
          ...VALID,
          registrationNumber: 'A4',
          programCode: LOOSE.code,
          departmentCode: 'DEV-OLD',
        }),
        row({
          ...VALID,
          registrationNumber: 'A5',
          programCode: LOOSE.code,
          departmentCode: 'DEV-CSE',
        }),
      ],
      MAPPING,
      context(),
    );
    expect(outcomes.map((o) => codes(o).errors)).toEqual([
      ['INACTIVE_PROGRAM'],
      ['ARCHIVED_SESSION'],
      ['PROGRAM_DEPARTMENT_MISMATCH'],
      ['INACTIVE_DEPARTMENT'],
      [],
    ]);
    expect(outcomes[2]?.errors[0]?.message).toMatch(
      /belongs to department DEV-CSE, not DEV-MBA-DEPT/,
    );
  });

  it('flags every occurrence of a registration number repeated in the file (case-insensitive)', () => {
    const outcomes = validateStudentRows(
      [
        row(VALID),
        row({ ...VALID, registrationNumber: ' dev-import-0001 ' }),
        row({
          ...VALID,
          registrationNumber: 'DEV-IMPORT-0002',
          rollReferenceNumber: 'DEV-ROLL-0002',
        }),
      ],
      MAPPING,
      context(),
    );
    expect(outcomes.map((o) => o.status)).toEqual(['ERROR', 'ERROR', 'VALID']);
    expect(outcomes[0]?.errors[0]).toMatchObject({
      code: 'DUPLICATE_REGISTRATION_IN_FILE',
      field: 'registrationNumber',
    });
  });

  it('validates status, dates, date order, lengths, formulas and error cells', () => {
    const outcomes = validateStudentRows(
      [
        row({ ...VALID, registrationNumber: 'B1', status: 'graduated' }),
        row({ ...VALID, registrationNumber: 'B2', dateOfBirth: '2004-13-01' }),
        row({
          ...VALID,
          registrationNumber: 'B3',
          admissionDate: '2026-08-01',
          completionDate: '2025-01-01',
        }),
        row({ ...VALID, registrationNumber: 'B4', fullName: 'x'.repeat(201) }),
        row({ ...VALID, registrationNumber: { type: 'formula', formula: 'A1', result: 'B5' } }),
        row({ ...VALID, registrationNumber: 'B6', fullName: { type: 'error', value: '#REF!' } }),
        row({ ...VALID, registrationNumber: 'B7', dateOfBirth: '15/01/2004' }),
        row({ ...VALID, registrationNumber: 'bad number!' }),
        row({
          ...VALID,
          registrationNumber: 'b9',
          status: 'completed',
          completionDate: '2030-06-30',
        }),
      ],
      MAPPING,
      context(),
    );
    expect(outcomes.map((o) => codes(o).errors)).toEqual([
      ['INVALID_STATUS'],
      ['INVALID_DATE'],
      ['INVALID_DATE_ORDER'],
      ['VALUE_TOO_LONG'],
      ['FORMULA_NOT_ALLOWED'],
      ['CELL_ERROR'],
      ['AMBIGUOUS_DATE'],
      ['INVALID_REGISTRATION_NUMBER'],
      [],
    ]);
    expect(outcomes[8]?.normalizedData.values.status).toBe('COMPLETED');
  });

  it('reads numeric registration numbers as text and honours an explicit date format', () => {
    const [outcome] = validateStudentRows(
      [row({ ...VALID, registrationNumber: 2026001, dateOfBirth: '15/01/2004' })],
      { ...MAPPING, dateFormat: 'DMY' },
      context(),
    );
    expect(outcome?.status).toBe('VALID');
    expect(outcome?.normalizedData.values).toMatchObject({
      registrationNumber: '2026001',
      dateOfBirth: '2004-01-15',
    });
  });

  it('warns (without blocking) about useful gaps only', () => {
    const outcomes = validateStudentRows(
      [
        row({ ...VALID, registrationNumber: 'C1', dateOfBirth: '', rollReferenceNumber: '' }),
        row({ ...VALID, registrationNumber: 'C2', status: 'COMPLETED' }),
      ],
      MAPPING,
      context(),
    );
    expect(outcomes.map((o) => [o.status, o.action, codes(o).warnings])).toEqual([
      ['WARNING', 'CREATE', ['DATE_OF_BIRTH_MISSING', 'ROLL_REFERENCE_MISSING']],
      ['WARNING', 'CREATE', ['COMPLETION_DATE_MISSING']],
    ]);
    // Unmapped optional columns produce no warnings at all.
    const minimal = {
      columns: { registrationNumber: 1, fullName: 3, programCode: 8, academicSessionCode: 10 },
      dateFormat: 'ISO' as const,
    };
    expect(
      validateStudentRows([row({ ...VALID, registrationNumber: 'C3' })], minimal, context())[0]
        ?.status,
    ).toBe('VALID');
  });

  it('warns about roll/reference collisions in the same program and session', () => {
    const outcomes = validateStudentRows(
      [
        row({ ...VALID, registrationNumber: 'D1', rollReferenceNumber: 'R-1' }),
        row({ ...VALID, registrationNumber: 'D2', rollReferenceNumber: 'r-1' }),
        row({ ...VALID, registrationNumber: 'D3', rollReferenceNumber: 'R-9' }),
        row({
          ...VALID,
          registrationNumber: 'D4',
          rollReferenceNumber: 'R-1',
          academicSessionCode: OTHER_SESSION.code,
        }),
      ],
      MAPPING,
      context({
        rollIndex: new Map([[rollKey(PROGRAM.id, SESSION.id, 'R-9'), new Set(['SOMEONE-ELSE'])]]),
      }),
    );
    expect(outcomes.map((o) => codes(o).warnings)).toEqual([
      ['ROLL_REFERENCE_CONFLICT'],
      ['ROLL_REFERENCE_CONFLICT'],
      ['ROLL_REFERENCE_CONFLICT'],
      [],
    ]);
  });
});

describe('existing registrations: UPDATE / SKIP / protected changes', () => {
  const existing = existingRegistration();
  const known = context({ existing: new Map([['DEV-IMPORT-0001', existing]]) });

  it('classifies an identical row as SKIP (case differences in the number are not changes)', () => {
    const [outcome] = validateStudentRows(
      [
        row({
          ...VALID,
          registrationNumber: 'dev-import-0001',
          fatherName: 'Test Father One',
          gender: 'Female',
          admissionDate: '2026-08-01',
        }),
      ],
      MAPPING,
      known,
    );
    expect(outcome).toMatchObject({ status: 'VALID', action: 'SKIP', registrationId: existing.id });
    expect(outcome?.normalizedData.changes).toEqual([]);
  });

  it('classifies safe differences as UPDATE with a field diff; blanks never clear values', () => {
    const [outcome] = validateStudentRows(
      [
        row({
          ...VALID,
          fullName: 'Test Student One Corrected',
          fatherName: '',
          motherName: 'Test Mother One',
        }),
      ],
      MAPPING,
      known,
    );
    expect(outcome).toMatchObject({ status: 'VALID', action: 'UPDATE' });
    expect(outcome?.normalizedData.changes).toEqual([
      { field: 'fullName', from: 'Test Student One', to: 'Test Student One Corrected' },
      { field: 'motherName', from: null, to: 'Test Mother One' },
    ]);
    expect(outcome?.normalizedData.current).toMatchObject({
      programCode: PROGRAM.code,
      fullName: 'Test Student One',
    });
  });

  it('never changes program, session, department or status of an existing registration', () => {
    const outcomes = validateStudentRows(
      [row({ ...VALID, programCode: MBA.code })],
      MAPPING,
      known,
    );
    expect(codes(outcomes[0]).errors).toEqual(['PROGRAM_CHANGE_NOT_ALLOWED']);
    expect(outcomes[0]?.errors[0]?.message).toMatch(
      /is in program DEV-BTECH-CSE.*cannot move it to DEV-MBA/,
    );

    const others = validateStudentRows(
      [
        row({
          ...VALID,
          registrationNumber: 'DEV-IMPORT-0001',
          academicSessionCode: OTHER_SESSION.code,
        }),
      ],
      MAPPING,
      known,
    );
    expect(codes(others[0]).errors).toEqual(['SESSION_CHANGE_NOT_ALLOWED']);
    expect(
      codes(validateStudentRows([row({ ...VALID, status: 'REVOKED' })], MAPPING, known)[0]).errors,
    ).toEqual(['STATUS_CHANGE_NOT_ALLOWED']);
    expect(
      codes(
        validateStudentRows([row({ ...VALID, departmentCode: 'DEV-MBA-DEPT' })], MAPPING, known)[0],
      ).errors,
    ).toEqual(['DEPARTMENT_CHANGE_NOT_ALLOWED']);
  });

  it('checks the date order against stored values', () => {
    const [outcome] = validateStudentRows(
      [row({ ...VALID, completionDate: '2020-01-01' })],
      MAPPING,
      known,
    );
    expect(codes(outcome).errors).toEqual(['INVALID_DATE_ORDER']);
  });

  it('is deterministic', () => {
    const rows = [row(VALID), row({ ...VALID, registrationNumber: 'E2' })];
    expect(validateStudentRows(rows, MAPPING, known)).toEqual(
      validateStudentRows(rows, MAPPING, known),
    );
  });
});
