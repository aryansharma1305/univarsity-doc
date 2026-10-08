import { importMappingSchema, normalizeImportHeader } from '@docversity/validation';
import { describe, expect, it } from 'vitest';
import { suggestStudentMapping, validateStudentMapping } from '../src/index.js';
import type { ImportColumn, ImportSheet } from '@docversity/validation';

function columns(headers: string[]): ImportColumn[] {
  return headers.map((header, index) => ({
    index: index + 1,
    letter: String.fromCharCode(65 + index),
    header,
    sensitive: false,
    values: null,
  }));
}

function sheet(headers: string[], overrides: Partial<ImportSheet> = {}): ImportSheet {
  const cols = columns(headers);
  return {
    name: 'Students',
    rowCount: 3,
    columnCount: cols.length,
    columns: cols,
    suggestedMapping: {},
    problem: null,
    ...overrides,
  };
}

describe('header normalisation', () => {
  it('folds case, punctuation, underscores and accents', () => {
    expect(normalizeImportHeader('  REG_NO. ')).toBe('reg no');
    expect(normalizeImportHeader('Registration-Number')).toBe('registration number');
    expect(normalizeImportHeader("Father's Name")).toBe('father s name');
    expect(normalizeImportHeader('Prógram  Côde')).toBe('program code');
  });
});

describe('mapping suggestions (deterministic)', () => {
  it('maps the exact template headers', () => {
    const mapping = suggestStudentMapping(
      columns([
        'Registration Number',
        'Student Name',
        'Program Code',
        'Academic Session Code',
        'Date of Birth',
      ]),
    );
    expect(mapping).toMatchObject({
      registrationNumber: 1,
      fullName: 2,
      programCode: 3,
      academicSessionCode: 4,
      dateOfBirth: 5,
      fatherName: null,
    });
  });

  it('suggests fields for common university header spellings', () => {
    for (const header of [
      'registration no',
      'registration_number',
      'REG NO',
      'reg_number',
      'Regn. No.',
    ]) {
      expect(suggestStudentMapping(columns([header])).registrationNumber, header).toBe(1);
    }
    expect(suggestStudentMapping(columns(['STUDENT NAME'])).fullName).toBe(1);
    expect(suggestStudentMapping(columns(['DOB'])).dateOfBirth).toBe(1);
    expect(suggestStudentMapping(columns(['Roll No'])).rollReferenceNumber).toBe(1);
  });

  it('leaves unknown columns unmapped and never maps one column twice', () => {
    const mapping = suggestStudentMapping(columns(['Remarks', 'Name', 'Student Name']));
    expect(mapping.fullName).toBe(3);
    expect(Object.values(mapping).filter((value) => value === 2)).toHaveLength(0);
    expect(Object.values(mapping).filter((value) => value === 1)).toHaveLength(0);
  });
});

describe('mapping validation', () => {
  const base = sheet([
    'Registration Number',
    'Student Name',
    'Program Code',
    'Academic Session Code',
    'Remarks',
  ]);
  const complete = { registrationNumber: 1, fullName: 2, programCode: 3, academicSessionCode: 4 };

  it('accepts a complete mapping', () => {
    const mapping = importMappingSchema.parse({ worksheet: 'Students', columns: complete });
    expect(mapping.dateFormat).toBe('ISO');
    expect(validateStudentMapping(mapping, [base])).toEqual([]);
  });

  it('requires every required field', () => {
    const mapping = importMappingSchema.parse({
      worksheet: 'Students',
      columns: { registrationNumber: 1 },
    });
    expect(validateStudentMapping(mapping, [base]).map((p) => p.path)).toEqual([
      'columns.fullName',
      'columns.programCode',
      'columns.academicSessionCode',
    ]);
  });

  it('rejects one column mapped to two fields', () => {
    const mapping = importMappingSchema.parse({
      worksheet: 'Students',
      columns: { ...complete, fatherName: 2 },
    });
    expect(validateStudentMapping(mapping, [base])).toEqual([
      {
        path: 'columns.fatherName',
        message: expect.stringMatching(/already mapped to Student Name/) as unknown,
      },
    ]);
  });

  it('rejects columns outside the sheet, unknown sheets and unusable sheets', () => {
    expect(
      validateStudentMapping(
        importMappingSchema.parse({ worksheet: 'Students', columns: { ...complete, gender: 9 } }),
        [base],
      ),
    ).toEqual([
      { path: 'columns.gender', message: 'This column does not exist in the worksheet.' },
    ]);
    expect(
      validateStudentMapping(importMappingSchema.parse({ worksheet: 'Other', columns: complete }), [
        base,
      ])[0]?.path,
    ).toBe('worksheet');
    expect(
      validateStudentMapping(
        importMappingSchema.parse({ worksheet: 'Students', columns: complete }),
        [{ ...base, problem: 'Too many rows' }],
      ),
    ).toEqual([{ path: 'worksheet', message: 'Too many rows' }]);
  });

  it('rejects unknown target fields and malformed mappings at the schema level', () => {
    expect(
      importMappingSchema.safeParse({ worksheet: 'Students', columns: { notAField: 1 } }).success,
    ).toBe(false);
    expect(
      importMappingSchema.safeParse({ worksheet: 'Students', columns: { fullName: 0 } }).success,
    ).toBe(false);
    expect(
      importMappingSchema.safeParse({ worksheet: 'Students', columns: {}, extra: true }).success,
    ).toBe(false);
    expect(
      importMappingSchema.safeParse({ worksheet: 'Students', columns: {}, dateFormat: 'YMD' })
        .success,
    ).toBe(false);
  });
});
