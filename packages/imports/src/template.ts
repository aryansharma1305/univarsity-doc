import ExcelJS from 'exceljs';
import { RESULT_IMPORT_FIELDS, STUDENT_IMPORT_FIELDS } from '@docversity/validation';

const NAVY = 'FF0B1F3A';
const LIGHT = 'FFF1F4F9';

/**
 * The official student import template: an "Instructions" sheet (every column, whether it is
 * required, its format and an obvious development example) and an empty "Students" sheet with the
 * header row. Examples live only on the Instructions sheet so a forgotten example row can never be
 * imported. Columns hold plain values — no formulas anywhere.
 */
export async function buildStudentTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Docversity';
  workbook.created = new Date(Date.UTC(2026, 0, 1));

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [
    { header: 'Column', key: 'label', width: 26 },
    { header: 'Required', key: 'required', width: 11 },
    { header: 'Format', key: 'format', width: 30 },
    { header: 'Description', key: 'description', width: 80 },
    { header: 'Example', key: 'example', width: 22 },
  ];
  instructions.spliceRows(
    1,
    0,
    ['Docversity — student import template'],
    [
      'Fill in the "Students" sheet: one row per registration, starting on row 2. Keep the header row. Do not use formulas.',
    ],
    [
      'Programs, departments and academic sessions must already exist in Docversity (use their codes). Missing ones are never created by an import.',
    ],
    [
      'Dates: use real Excel date cells or text in YYYY-MM-DD (for example 2026-10-08). Text such as 01/02/2026 is ambiguous and is rejected unless a day-first or month-first format is chosen during mapping.',
    ],
    [
      'Existing registration numbers are matched without regard to case. Only names, date of birth, gender, roll/reference number and admission/completion dates can be updated by an import, and only after you approve the changes. Program, academic session, department and status are never changed by an import.',
    ],
    ['The example values below are fictitious development data.'],
    [],
  );
  instructions.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } };
  for (let row = 2; row <= 6; row++) {
    instructions.mergeCells(row, 1, row, 5);
    instructions.getRow(row).alignment = { wrapText: true, vertical: 'top' };
    instructions.getRow(row).height = 32;
  }
  const headerRow = instructions.getRow(8);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  for (const field of STUDENT_IMPORT_FIELDS) {
    const row = instructions.addRow({
      label: field.label,
      required: field.required ? 'Required' : 'Optional',
      format:
        field.kind === 'date'
          ? 'Date (date cell or YYYY-MM-DD)'
          : field.kind === 'code'
            ? `Existing code (max ${field.maxLength ?? 32})`
            : field.kind === 'status'
              ? 'ACTIVE / COMPLETED / SUSPENDED / REVOKED'
              : `Text (max ${field.maxLength ?? 200})`,
      description: field.description,
      example: field.example,
    });
    row.alignment = { wrapText: true, vertical: 'top' };
    if (field.required) row.getCell('required').font = { bold: true };
  }

  const students = workbook.addWorksheet('Students', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  students.columns = STUDENT_IMPORT_FIELDS.map((field) => ({
    header: field.label,
    key: field.key,
    width: Math.max(16, field.label.length + 4),
    style:
      field.kind === 'date'
        ? { numFmt: 'yyyy-mm-dd' }
        : // Text format keeps registration/roll numbers like 000123 exactly as typed.
          { numFmt: '@' },
  }));
  const studentHeader = students.getRow(1);
  studentHeader.font = { bold: true };
  studentHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  const statusColumn = STUDENT_IMPORT_FIELDS.findIndex((field) => field.key === 'status') + 1;
  for (let row = 2; row <= 1_000; row++) {
    students.getCell(row, statusColumn).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"ACTIVE,COMPLETED,SUSPENDED,REVOKED"'],
    };
  }
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 20_000,
      height: 12_000,
      firstSheet: 0,
      activeTab: 1,
      visibility: 'visible',
    },
  ];

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/**
 * The results import template (Phase 10B): an "Instructions" sheet and an empty "Results" sheet,
 * one row per student and subject. The examination, course, curriculum version, session and
 * semester/year are chosen in Docversity before uploading, so the sheet has no columns for them.
 * Grade is left out: grades are not accepted until university policy allows them. Registration
 * numbers and subject codes are text-formatted so leading zeros are kept.
 */
export async function buildResultTemplate(): Promise<Uint8Array> {
  const fields = RESULT_IMPORT_FIELDS.filter((field) => field.key !== 'grade');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Docversity';
  workbook.created = new Date(Date.UTC(2026, 0, 1));

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [
    { header: 'Column', key: 'label', width: 22 },
    { header: 'Required', key: 'required', width: 12 },
    { header: 'Format', key: 'format', width: 34 },
    { header: 'Description', key: 'description', width: 70 },
    { header: 'Example', key: 'example', width: 18 },
  ];
  instructions.spliceRows(
    1,
    0,
    ['Docversity — results import template'],
    [
      'Fill in the "Results" sheet: one row per student and subject, starting on row 2. Keep the header row. Do not use formulas — calculated cells are rejected.',
    ],
    [
      'Choose the course, curriculum version, academic session, semester/year and examination in Docversity before uploading. They are not columns in this sheet.',
    ],
    [
      'Registration numbers must be text exactly as issued (keep leading zeros such as 000123). Leave a mark blank when it was not awarded; 0 means zero marks.',
    ],
    [
      'Marks: numbers with at most 2 decimal places, not negative, within the maxima configured for the subject. Grades are not accepted yet.',
    ],
    ['The example values below are fictitious development data.'],
    [],
  );
  instructions.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } };
  for (let row = 2; row <= 6; row++) {
    instructions.mergeCells(row, 1, row, 5);
    instructions.getRow(row).alignment = { wrapText: true, vertical: 'top' };
    instructions.getRow(row).height = 32;
  }
  const headerRow = instructions.getRow(8);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  for (const field of fields) {
    const row = instructions.addRow({
      label: field.label,
      required: field.required ? 'Required' : 'Optional',
      format:
        field.kind === 'numeric'
          ? 'Number, at most 2 decimal places'
          : field.kind === 'code'
            ? `Subject code in the curriculum (max ${field.maxLength ?? 32})`
            : `Text (max ${field.maxLength ?? 64})`,
      description: field.description,
      example: field.example,
    });
    row.alignment = { wrapText: true, vertical: 'top' };
    if (field.required) row.getCell('required').font = { bold: true };
  }

  const results = workbook.addWorksheet('Results', { views: [{ state: 'frozen', ySplit: 1 }] });
  results.columns = fields.map((field) => ({
    header: field.label,
    key: field.key,
    width: Math.max(16, field.label.length + 4),
    style: field.kind === 'numeric' ? { numFmt: '0.00' } : { numFmt: '@' },
  }));
  const resultsHeader = results.getRow(1);
  resultsHeader.font = { bold: true };
  resultsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 20_000,
      height: 12_000,
      firstSheet: 0,
      activeTab: 1,
      visibility: 'visible',
    },
  ];
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
