import ExcelJS from 'exceljs';
import {
  type ImportColumn,
  type ImportSheet,
  isSensitiveImportHeader,
} from '@docversity/validation';
import { cellDisplay, type SourceCell, toSourceCell } from './cells.js';
import { ImportFileError } from './errors.js';
import { suggestStudentMapping } from './mapping.js';

export interface SheetLimits {
  maxRows: number;
  maxColumns: number;
}

/** More worksheets than this is not a data file. */
export const MAX_WORKSHEETS = 20;

export interface SourceRow {
  /** The row number as Excel shows it (header = 1). */
  rowNumber: number;
  /** Cells by column (index 0 = column A). */
  cells: SourceCell[];
}

/** Column number → letters (1 → A, 27 → AA). */
export function columnLetter(index: number): string {
  let letters = '';
  let remaining = index;
  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + modulo) + letters;
    remaining = Math.floor((remaining - modulo) / 26);
  }
  return letters;
}

/**
 * Parses an .xlsx file (already checked by `verifyXlsxContainer`). Formulas are not calculated —
 * ExcelJS only exposes the formula text and Excel's cached result.
 */
export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS declares its own `Buffer` type; a Node Buffer is what it actually expects.
    type LoadInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];
    await workbook.xlsx.load(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as LoadInput,
    );
  } catch {
    throw new ImportFileError(
      'UNREADABLE_WORKBOOK',
      'The workbook could not be read. Open it in Excel, save it as "Excel Workbook (.xlsx)" and upload it again.',
    );
  }
  if (workbook.worksheets.length === 0) {
    throw new ImportFileError('EMPTY_WORKBOOK', 'The workbook has no worksheets.');
  }
  if (workbook.worksheets.length > MAX_WORKSHEETS) {
    throw new ImportFileError(
      'TOO_MANY_WORKSHEETS',
      `The workbook has ${workbook.worksheets.length} worksheets; at most ${MAX_WORKSHEETS} are supported.`,
    );
  }
  return workbook;
}

function lastUsedColumn(worksheet: ExcelJS.Worksheet): number {
  let last = 0;
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (column > last && toSourceCell(cell.value).type !== 'blank') last = column;
    });
  });
  return last;
}

/** Distinct values are only collected for columns with at most this many (codes, statuses…). */
const MAX_DISTINCT_VALUES = 100;
const MAX_VALUE_LENGTH = 200;

function headerColumns(worksheet: ExcelJS.Worksheet, columnCount: number): ImportColumn[] {
  const header = worksheet.getRow(1);
  const columns: ImportColumn[] = [];
  for (let index = 1; index <= columnCount; index++) {
    const display = cellDisplay(toSourceCell(header.getCell(index).value));
    const text = (display ?? '').trim().slice(0, 200);
    columns.push({
      index,
      letter: columnLetter(index),
      header: text,
      sensitive: isSensitiveImportHeader(text),
      values: null,
    });
  }
  return columns;
}

/**
 * Adds the distinct (trimmed) values of CATEGORY-LIKE, non-sensitive columns — e.g. course names,
 * school names, statuses — so the administrator can translate them explicitly. A column qualifies only
 * when its values repeat (on average at least twice) and there are at most 100 of them, so per-person
 * columns (names, registration numbers, identity numbers) are never collected, whatever the file size.
 */
function collectDistinctValues(worksheet: ExcelJS.Worksheet, columns: ImportColumn[]): void {
  const sets = columns.map((column) => (column.sensitive ? null : new Set<string>()));
  const filled = columns.map(() => 0);
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    columns.forEach((column, position) => {
      const set = sets[position];
      if (!set || set.size > MAX_DISTINCT_VALUES) return;
      const cell = toSourceCell(row.getCell(column.index).value);
      if (cell.type !== 'string' && cell.type !== 'number') return;
      filled[position] = (filled[position] ?? 0) + 1;
      const value = String(cell.value).trim().replace(/\s+/g, ' ');
      if (value.length > MAX_VALUE_LENGTH) {
        sets[position] = null;
        return;
      }
      set.add(value);
    });
  });
  columns.forEach((column, position) => {
    const set = sets[position];
    const categoryLike =
      set !== null && set !== undefined && set.size > 0 && set.size * 2 <= (filled[position] ?? 0);
    column.values = categoryLike && set.size <= MAX_DISTINCT_VALUES ? [...set].sort() : null;
  });
}

function rowHasValue(row: ExcelJS.Row): boolean {
  for (let column = 1; column <= row.cellCount; column++) {
    if (toSourceCell(row.getCell(column).value).type !== 'blank') return true;
  }
  return false;
}

function countDataRows(worksheet: ExcelJS.Worksheet): number {
  let count = 0;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 1 && rowHasValue(row)) count++;
  });
  return count;
}

/** Describes every worksheet: size, header row, deterministic mapping suggestions, problems. */
export function describeWorksheets(workbook: ExcelJS.Workbook, limits: SheetLimits): ImportSheet[] {
  return workbook.worksheets.map((worksheet) => {
    const columnCount = lastUsedColumn(worksheet);
    const rowCount = countDataRows(worksheet);
    const columns = headerColumns(worksheet, Math.min(columnCount, limits.maxColumns));
    collectDistinctValues(worksheet, columns);
    let problem: string | null = null;
    if (columnCount === 0 || rowCount === 0) {
      problem = 'This worksheet has no data rows below the header row.';
    } else if (columnCount > limits.maxColumns) {
      problem = `This worksheet has ${columnCount} columns; the limit is ${limits.maxColumns}.`;
    } else if (rowCount > limits.maxRows) {
      problem = `This worksheet has ${rowCount.toLocaleString('en-US')} data rows; the limit is ${limits.maxRows.toLocaleString('en-US')}. Split the file.`;
    }
    return {
      name: worksheet.name,
      rowCount,
      columnCount,
      columns,
      suggestedMapping: suggestStudentMapping(columns),
      problem,
    };
  });
}

/** The worksheet chosen by default: "Students" (the template's data sheet), else the first usable one. */
export function defaultWorksheet(sheets: ImportSheet[]): string | null {
  const usable = sheets.filter((sheet) => sheet.problem === null);
  const named = usable.find((sheet) => sheet.name.trim().toLowerCase() === 'students');
  return (named ?? usable[0])?.name ?? null;
}

/**
 * Reads the data rows (row 2 onwards) of one worksheet. Rows whose cells are all blank are skipped
 * (they are not counted as rows). Enforces the row and column limits.
 */
export function readWorksheetRows(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  limits: SheetLimits,
): { columns: ImportColumn[]; rows: SourceRow[] } {
  const worksheet = workbook.worksheets.find((sheet) => sheet.name === sheetName);
  if (!worksheet) {
    throw new ImportFileError(
      'WORKSHEET_NOT_FOUND',
      `The worksheet "${sheetName}" no longer exists in this file.`,
    );
  }
  const columnCount = lastUsedColumn(worksheet);
  if (columnCount > limits.maxColumns) {
    throw new ImportFileError(
      'TOO_MANY_COLUMNS',
      `The worksheet has ${columnCount} columns; the limit is ${limits.maxColumns}.`,
    );
  }
  const columns = headerColumns(worksheet, columnCount);
  const sensitive = new Set(
    columns.filter((column) => column.sensitive).map((column) => column.index),
  );
  const rows: SourceRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: SourceCell[] = [];
    let hasValue = false;
    for (let index = 1; index <= columnCount; index++) {
      // Sensitive columns (national IDs…) are dropped here: never validated, staged or shown.
      const cell = sensitive.has(index)
        ? ({ type: 'blank' } as const)
        : toSourceCell(row.getCell(index).value);
      if (cell.type !== 'blank') hasValue = true;
      cells.push(cell);
    }
    if (!hasValue) return;
    if (rows.length >= limits.maxRows) {
      throw new ImportFileError(
        'TOO_MANY_ROWS',
        `The worksheet has more than ${limits.maxRows.toLocaleString('en-US')} data rows. Split the file.`,
      );
    }
    rows.push({ rowNumber, cells });
  });
  if (rows.length === 0) {
    throw new ImportFileError(
      'NO_DATA_ROWS',
      'The worksheet has no data rows below the header row.',
    );
  }
  return { columns, rows };
}
