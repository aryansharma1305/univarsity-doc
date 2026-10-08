import { describe, expect, it } from 'vitest';
import {
  describeWorksheets,
  loadWorkbook,
  readWorksheetRows,
  validateStudentMapping,
  validateStudentRows,
  type StudentValidationContext,
} from '../src/index.js';
import { buildWorkbook, registration2025Sheet } from '../src/testing.js';
import {
  type ImportSheet,
  importMappingSchema,
  isSensitiveImportHeader,
} from '@docversity/validation';
import { DEPT, LOOSE, PROGRAM, REFERENCES, SESSION, OTHER_DEPT } from './helpers.js';

const LIMITS = { maxRows: 1000, maxColumns: 50 };

function sheets(sheet: ImportSheet | undefined): ImportSheet[] {
  if (!sheet) throw new Error('worksheet missing');
  return [sheet];
}

function students(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Test Student ${index + 1}`,
    registrationNumber: 250_100_001 + index,
    courseName: index % 3 === 0 ? 'Certificate in Test Ultrasonography' : 'Test Open Program',
    schoolName: 'Test University Campus',
    status: index === 4 ? 'Inactive' : 'Active',
  }));
}

const context: StudentValidationContext = {
  references: REFERENCES,
  existing: new Map(),
  rollIndex: new Map(),
};

describe('"Registration 2025" workbook shape (synthetic data)', () => {
  it('detects identity-number columns and never maps, collects or stages them', async () => {
    expect(isSensitiveImportHeader('National Id No.')).toBe(true);
    expect(isSensitiveImportHeader('Aadhaar Number')).toBe(true);
    expect(isSensitiveImportHeader('Passport No')).toBe(true);
    expect(isSensitiveImportHeader('Nationality')).toBe(false);
    expect(isSensitiveImportHeader('Registration No.')).toBe(false);

    const workbook = await loadWorkbook(await buildWorkbook([registration2025Sheet(students(8))]));
    const [sheet] = describeWorksheets(workbook, LIMITS);
    const nationalId = sheet?.columns.find((column) => column.header === 'National Id No.');
    expect(nationalId).toMatchObject({ letter: 'H', sensitive: true, values: null });
    expect(Object.values(sheet?.suggestedMapping ?? {})).not.toContain(8);

    const { rows } = readWorksheetRows(workbook, 'Registration List', LIMITS);
    expect(rows.every((row) => row.cells[7]?.type === 'blank')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('TEST-NATIONAL-ID');

    const mapping = importMappingSchema.parse({
      worksheet: 'Registration List',
      columns: { registrationNumber: 4, fullName: 2, programCode: 8 },
      defaultAcademicSessionId: SESSION.id,
    });
    expect(validateStudentMapping(mapping, sheets(sheet))).toContainEqual({
      path: 'columns.programCode',
      message: 'This column holds identity numbers and is never imported.',
    });
  });

  it('suggests the real headers and collects only category-like values', async () => {
    const workbook = await loadWorkbook(await buildWorkbook([registration2025Sheet(students(8))]));
    const [sheet] = describeWorksheets(workbook, LIMITS);
    expect(sheet?.name).toBe('Registration List');
    expect(sheet?.suggestedMapping).toMatchObject({
      registrationNumber: 4,
      fullName: 2,
      admissionDate: 3,
      dateOfBirth: 6,
      programCode: 10,
      departmentCode: 12,
      status: 13,
      academicSessionCode: null,
    });
    const values = Object.fromEntries(
      (sheet?.columns ?? []).map((column) => [column.header, column.values]),
    );
    expect(values['Course Name']).toEqual([
      'Certificate in Test Ultrasonography',
      'Test Open Program',
    ]);
    expect(values['Registration Status']).toEqual(['Active', 'Inactive']);
    expect(values['School Name']).toEqual(['Test University Campus']);
    // Per-person columns are never collected.
    expect(values.Name).toBeNull();
    expect(values['Registration No.']).toBeNull();
    expect(values['S.No']).toBeNull();
  });

  it('imports with one session for all rows, course names, a school→department map and status translation', async () => {
    const workbook = await loadWorkbook(await buildWorkbook([registration2025Sheet(students(8))]));
    const [sheet] = describeWorksheets(workbook, LIMITS);
    const mapping = importMappingSchema.parse({
      worksheet: 'Registration List',
      columns: sheet?.suggestedMapping,
      defaultAcademicSessionId: SESSION.id,
      valueMaps: {
        departmentCode: { 'TEST UNIVERSITY CAMPUS': null },
        status: { INACTIVE: 'SUSPENDED' },
      },
    });
    expect(validateStudentMapping(mapping, sheets(sheet))).toEqual([]);
    const { rows } = readWorksheetRows(workbook, 'Registration List', LIMITS);
    const outcomes = validateStudentRows(rows, mapping, context);
    expect(outcomes.map((o) => o.status)).toEqual(Array(8).fill('VALID'));
    expect(outcomes[0]?.normalizedData).toMatchObject({
      programId: PROGRAM.id,
      departmentId: DEPT.id,
      academicSessionId: SESSION.id,
      values: {
        registrationNumber: '250100001',
        programCode: PROGRAM.code,
        academicSessionCode: SESSION.code,
        status: 'ACTIVE',
      },
    });
    expect(outcomes[1]?.normalizedData).toMatchObject({ programId: LOOSE.id, departmentId: null });
    expect(outcomes[4]?.normalizedData.values.status).toBe('SUSPENDED');
    // Date of Birth and Photo are empty for every row: no warnings at all (collected later).
    expect(outcomes.flatMap((o) => o.warnings)).toEqual([]);
    // The staged source row contains no identity numbers.
    expect(JSON.stringify(outcomes.map((o) => o.rawData))).not.toContain('NATIONAL');
  });

  it('reports untranslated values instead of guessing', async () => {
    const workbook = await loadWorkbook(await buildWorkbook([registration2025Sheet(students(5))]));
    const [sheet] = describeWorksheets(workbook, LIMITS);
    const mapping = importMappingSchema.parse({
      worksheet: 'Registration List',
      columns: sheet?.suggestedMapping,
      defaultAcademicSessionId: SESSION.id,
    });
    const outcomes = validateStudentRows(
      readWorksheetRows(workbook, 'Registration List', LIMITS).rows,
      mapping,
      context,
    );
    const codes = outcomes.map((o) => o.errors.map((e) => e.code));
    expect(codes[0]).toEqual(['UNKNOWN_DEPARTMENT']);
    expect(codes[4]).toEqual(['INVALID_STATUS', 'UNKNOWN_DEPARTMENT']);
    expect(outcomes[4]?.errors[0]?.message).toMatch(/translate this value while mapping/);
  });

  it('requires a session column or a session for every row', () => {
    const sheet = {
      name: 'S',
      rowCount: 1,
      columnCount: 3,
      columns: ['A', 'B', 'C'].map((letter, index) => ({
        index: index + 1,
        letter,
        header: letter,
        sensitive: false,
        values: null,
      })),
      suggestedMapping: {},
      problem: null,
    };
    const columns = { registrationNumber: 1, fullName: 2, programCode: 3 };
    expect(
      validateStudentMapping(importMappingSchema.parse({ worksheet: 'S', columns }), [sheet]),
    ).toEqual([
      {
        path: 'columns.academicSessionCode',
        message: 'Choose the column for Academic Session Code, or one session for every row.',
      },
    ]);
    expect(
      validateStudentMapping(
        importMappingSchema.parse({
          worksheet: 'S',
          columns,
          defaultAcademicSessionId: SESSION.id,
        }),
        [sheet],
      ),
    ).toEqual([]);
  });
});

describe('value resolution and warnings', () => {
  const base = {
    columns: {
      registrationNumber: 1,
      fullName: 2,
      programCode: 3,
      departmentCode: 4,
      academicSessionCode: 5,
      dateOfBirth: 6,
    },
    dateFormat: 'ISO' as const,
  };
  const row = (n: number, cells: (string | number | null)[]) => ({
    rowNumber: n,
    cells: cells.map((value) =>
      value === null
        ? ({ type: 'blank' } as const)
        : typeof value === 'number'
          ? ({ type: 'number', value } as const)
          : ({ type: 'string', value } as const),
    ),
  });

  it('matches programs, departments and sessions by name (case/spacing-insensitive) or explicit map', () => {
    const outcomes = validateStudentRows(
      [
        row(2, [
          'A1',
          'Test',
          '  certificate in TEST ultrasonography ',
          'test school of computing',
          'test session 2026-27',
          null,
        ]),
        row(3, ['A2', 'Test', 'Ultrasound Diploma', null, 'DEV-2026-27', null]),
      ],
      { ...base, valueMaps: { programCode: { 'ULTRASOUND DIPLOMA': LOOSE.id } } },
      context,
    );
    expect(outcomes[0]).toMatchObject({
      status: 'VALID',
      normalizedData: {
        programId: PROGRAM.id,
        departmentId: DEPT.id,
        academicSessionId: SESSION.id,
      },
    });
    expect(outcomes[1]).toMatchObject({ status: 'VALID', normalizedData: { programId: LOOSE.id } });
    const mismatch = validateStudentRows(
      [row(4, ['A3', 'Test', PROGRAM.code, OTHER_DEPT.name, SESSION.code, null])],
      base,
      context,
    );
    expect(mismatch[0]?.errors.map((e) => e.code)).toEqual(['PROGRAM_DEPARTMENT_MISMATCH']);
  });

  it('warns about a missing date of birth only when the column is normally filled', () => {
    const outcomes = validateStudentRows(
      [
        row(2, ['B1', 'Test', PROGRAM.code, null, SESSION.code, '2004-01-01']),
        row(3, ['B2', 'Test', PROGRAM.code, null, SESSION.code, null]),
      ],
      base,
      context,
    );
    expect(outcomes.map((o) => o.warnings.map((w) => w.code))).toEqual([
      [],
      ['DATE_OF_BIRTH_MISSING'],
    ]);
  });

  it('flags numeric registration numbers that may have lost leading zeros', () => {
    const outcomes = validateStudentRows(
      [
        row(2, [250100001, 'Test', PROGRAM.code, null, SESSION.code, null]),
        row(3, [250100002, 'Test', PROGRAM.code, null, SESSION.code, null]),
        row(4, [25010003, 'Test', PROGRAM.code, null, SESSION.code, null]),
        row(5, ['02501004', 'Test', PROGRAM.code, null, SESSION.code, null]),
      ],
      base,
      context,
    );
    expect(outcomes.map((o) => o.warnings.map((w) => w.code))).toEqual([
      [],
      [],
      ['REGISTRATION_NUMBER_MAY_HAVE_LOST_ZEROS'],
      [],
    ]);
    expect(outcomes[2]?.status).toBe('WARNING');
  });
});
