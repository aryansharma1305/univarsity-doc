import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  IMPORT_TRANSITIONS,
  assertTransition,
  buildErrorReport,
  buildStudentTemplate,
  canTransition,
  escapeSpreadsheetText,
  importActions,
  loadWorkbook,
  retryTarget,
  sanitizeFilename,
  uuidv7,
  verifyXlsxContainer,
} from '../src/index.js';
import { STUDENT_TEMPLATE_HEADERS } from '../src/testing.js';

describe('import state machine', () => {
  it('allows the happy path and the documented side exits only', () => {
    const path = [
      'UPLOADED',
      'MAPPING',
      'VALIDATING',
      'VALIDATED',
      'PROCESSING',
      'COMPLETED',
    ] as const;
    for (let index = 0; index < path.length - 1; index++) {
      expect(canTransition(path[index] ?? 'UPLOADED', path[index + 1] ?? 'UPLOADED')).toBe(true);
    }
    expect(canTransition('VALIDATING', 'FAILED')).toBe(true);
    expect(canTransition('PROCESSING', 'FAILED')).toBe(true);
    expect(canTransition('VALIDATED', 'MAPPING')).toBe(true);
    expect(canTransition('MAPPING', 'PROCESSING')).toBe(false);
    expect(canTransition('UPLOADED', 'VALIDATED')).toBe(false);
    expect(canTransition('PROCESSING', 'CANCELLED')).toBe(false);
  });

  it('keeps COMPLETED and CANCELLED terminal', () => {
    expect(IMPORT_TRANSITIONS.COMPLETED).toEqual([]);
    expect(IMPORT_TRANSITIONS.CANCELLED).toEqual([]);
    expect(() => {
      assertTransition(['COMPLETED'], 'PROCESSING');
    }).toThrow(/Invalid import transition/);
  });

  it('offers actions per state and retry only for retryable failures', () => {
    expect(importActions('VALIDATED', null)).toEqual({
      map: true,
      validate: true,
      commit: true,
      cancel: true,
      retry: false,
    });
    expect(importActions('PROCESSING', null)).toEqual({
      map: false,
      validate: false,
      commit: false,
      cancel: false,
      retry: false,
    });
    const systemFailure = {
      stage: 'COMMIT' as const,
      code: 'SYSTEM_ERROR',
      message: '',
      retryable: true,
    };
    expect(importActions('FAILED', systemFailure).retry).toBe(true);
    expect(importActions('FAILED', { ...systemFailure, retryable: false }).retry).toBe(false);
    expect(retryTarget(systemFailure)).toBe('PROCESSING');
    expect(retryTarget({ ...systemFailure, stage: 'PARSE' })).toBe('UPLOADED');
  });
});

describe('student template', () => {
  it('has an Instructions sheet and a Students sheet with the documented headers', async () => {
    const bytes = await buildStudentTemplate();
    expect(() => {
      verifyXlsxContainer(bytes, { maxUncompressedBytes: 10_000_000 });
    }).not.toThrow();
    const workbook = await loadWorkbook(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Instructions', 'Students']);
    const students = workbook.getWorksheet('Students');
    const headers = (students?.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual([...STUDENT_TEMPLATE_HEADERS]);
    expect(STUDENT_TEMPLATE_HEADERS).toEqual([
      'Registration Number',
      'Roll / Reference Number',
      'Student Name',
      'Father Name',
      'Mother Name',
      'Date of Birth',
      'Gender',
      'Program Code',
      'Department Code',
      'Academic Session Code',
      'Admission Date',
      'Completion Date',
      'Status',
    ]);
    // No data rows (examples live on the Instructions sheet only) and no formulas anywhere.
    expect(students?.actualRowCount).toBe(1);
    const instructions = workbook.getWorksheet('Instructions');
    let formulas = 0;
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.type === ExcelJS.ValueType.Formula) formulas++;
        });
      });
    }
    expect(formulas).toBe(0);
    const text = JSON.stringify(instructions?.getSheetValues());
    expect(text).toContain('DEV-IMPORT-0001');
    expect(text).toContain('Date of Birth');
    expect(text).toMatch(/Optional/);
  });
});

describe('error report', () => {
  it('lists issue rows with codes and messages and neutralises formula injection', async () => {
    const bytes = await buildErrorReport(
      [
        {
          rowNumber: 7,
          registrationNumber: '=HYPERLINK("http://evil.test","x")',
          fullName: '@SUM(1+1)',
          status: 'ERROR',
          action: null,
          errors: [
            {
              code: 'UNKNOWN_PROGRAM',
              severity: 'error',
              field: 'programCode',
              message: 'No program with code "X" exists.',
            },
          ],
          warnings: [],
        },
        {
          rowNumber: 9,
          registrationNumber: 'DEV-IMPORT-0009',
          fullName: '-Test Student',
          status: 'WARNING',
          action: 'CREATE',
          errors: [],
          warnings: [
            {
              code: 'DATE_OF_BIRTH_MISSING',
              severity: 'warning',
              field: 'dateOfBirth',
              message: 'Date of Birth is empty.',
            },
          ],
        },
      ],
      {
        filename: '+evil.xlsx',
        worksheet: 'Students',
        generatedAt: new Date('2026-10-08T00:00:00Z'),
        counts: { 'Rows read': 2 },
      },
    );
    const workbook = await loadWorkbook(bytes);
    const issues = workbook.getWorksheet('Issues');
    expect((issues?.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Row',
      'Registration Number',
      'Student Name',
      'Status',
      'Error Codes',
      'Messages',
      'Action Required',
    ]);
    const first = (issues?.getRow(2).values as unknown[]).slice(1);
    expect(first.slice(0, 5)).toEqual([
      7,
      `'=HYPERLINK("http://evil.test","x")`,
      `'@SUM(1+1)`,
      'ERROR',
      'UNKNOWN_PROGRAM',
    ]);
    expect(String(first[5])).toContain('Program Code: No program with code "X" exists.');
    expect((issues?.getRow(3).values as unknown[])[3]).toBe(`'-Test Student`);
    let formulas = 0;
    issues?.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.type === ExcelJS.ValueType.Formula) formulas++;
      });
    });
    expect(formulas).toBe(0);
    expect(JSON.stringify(workbook.getWorksheet('Summary')?.getSheetValues())).toContain(
      "'+evil.xlsx",
    );
  });
});

describe('safety helpers', () => {
  it('escapes dangerous spreadsheet prefixes only', () => {
    expect(escapeSpreadsheetText('=1+1')).toBe("'=1+1");
    expect(escapeSpreadsheetText('+44')).toBe("'+44");
    expect(escapeSpreadsheetText('-5')).toBe("'-5");
    expect(escapeSpreadsheetText('@x')).toBe("'@x");
    expect(escapeSpreadsheetText('\tx')).toBe("'\tx");
    expect(escapeSpreadsheetText('DEV-1')).toBe('DEV-1');
  });

  it('reduces uploaded filenames to a harmless display name', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\students.xlsx')).toBe('students.xlsx');
    expect(sanitizeFilename('bad\u0000name\r\n.xlsx')).toBe('badname.xlsx');
    expect(sanitizeFilename('..')).toBe('upload.xlsx');
    expect(sanitizeFilename('')).toBe('upload.xlsx');
    expect(sanitizeFilename(`${'a'.repeat(300)}.xlsx`)).toHaveLength(200);
  });

  it('generates time-ordered version-7 UUIDs', () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
