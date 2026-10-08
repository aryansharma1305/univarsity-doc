import { describe, expect, it } from 'vitest';
import {
  describeWorksheets,
  defaultWorksheet,
  loadWorkbook,
  parseDateCell,
  parseDateText,
  readWorksheetRows,
  toSourceCell,
} from '../src/index.js';
import { buildWorkbook, studentSheet } from '../src/testing.js';

const LIMITS = { maxRows: 100, maxColumns: 20 };

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function syncCodeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('workbook parsing', () => {
  it('reads a valid workbook: headers, rows, suggestions', async () => {
    const bytes = await buildWorkbook([
      studentSheet([{ registrationNumber: 'DEV-IMPORT-0001', fullName: 'Test Student One' }]),
    ]);
    const workbook = await loadWorkbook(bytes);
    const [sheet] = describeWorksheets(workbook, LIMITS);
    expect(sheet).toMatchObject({ name: 'Students', rowCount: 1, columnCount: 13, problem: null });
    expect(sheet?.columns[0]).toEqual({
      index: 1,
      letter: 'A',
      header: 'Registration Number',
      sensitive: false,
      values: null,
    });
    expect(sheet?.suggestedMapping.registrationNumber).toBe(1);
    expect(sheet?.suggestedMapping.status).toBe(13);

    const { rows } = readWorksheetRows(workbook, 'Students', LIMITS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowNumber).toBe(2);
    expect(rows[0]?.cells[0]).toEqual({ type: 'string', value: 'DEV-IMPORT-0001' });
  });

  it('reports an empty worksheet and an empty workbook', async () => {
    const workbook = await loadWorkbook(await buildWorkbook([{ name: 'Empty', rows: [] }]));
    const sheets = describeWorksheets(workbook, LIMITS);
    expect(sheets[0]?.problem).toMatch(/no data rows/);
    expect(defaultWorksheet(sheets)).toBeNull();
    expect(syncCodeOf(() => readWorksheetRows(workbook, 'Empty', LIMITS))).toBe('NO_DATA_ROWS');
    expect(await codeOf(loadWorkbook(await buildWorkbook([])))).toBe('EMPTY_WORKBOOK');
  });

  it('rejects malformed and wrong-type files', async () => {
    expect(await codeOf(loadWorkbook(new TextEncoder().encode('not a workbook')))).toBe(
      'UNREADABLE_WORKBOOK',
    );
    const bytes = await buildWorkbook([studentSheet([{ registrationNumber: 'X' }])]);
    const corrupted = new Uint8Array(bytes);
    corrupted.fill(0x41, 200, 1200);
    expect(await codeOf(loadWorkbook(corrupted))).toBe('UNREADABLE_WORKBOOK');
  });

  it('handles multiple sheets and prefers the "Students" sheet', async () => {
    const workbook = await loadWorkbook(
      await buildWorkbook([
        { name: 'Instructions', rows: [['Read me'], ['Some text']] },
        studentSheet([{ registrationNumber: 'DEV-1', fullName: 'Test Student One' }]),
      ]),
    );
    const sheets = describeWorksheets(workbook, LIMITS);
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Instructions', 'Students']);
    expect(defaultWorksheet(sheets)).toBe('Students');
  });

  it('reports a missing worksheet', async () => {
    const workbook = await loadWorkbook(
      await buildWorkbook([studentSheet([{ registrationNumber: 'A' }])]),
    );
    expect(syncCodeOf(() => readWorksheetRows(workbook, 'Gone', LIMITS))).toBe(
      'WORKSHEET_NOT_FOUND',
    );
  });

  it('enforces the row limit and skips blank rows without counting them', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => [`DEV-${index}`]);
    const workbook = await loadWorkbook(
      await buildWorkbook([
        {
          name: 'Students',
          rows: [['Registration Number'], ...rows, [null], ['', null], ['DEV-LAST']],
        },
      ]),
    );
    expect(describeWorksheets(workbook, { maxRows: 5, maxColumns: 20 })[0]?.problem).toMatch(
      /7 data rows; the limit is 5/,
    );
    expect(
      syncCodeOf(() => readWorksheetRows(workbook, 'Students', { maxRows: 5, maxColumns: 20 })),
    ).toBe('TOO_MANY_ROWS');
    expect(
      readWorksheetRows(workbook, 'Students', LIMITS).rows.map((row) => row.rowNumber),
    ).toEqual([2, 3, 4, 5, 6, 7, 10]);
  });

  it('enforces the column limit', async () => {
    const header = Array.from({ length: 25 }, (_, index) => `Column ${index + 1}`);
    const workbook = await loadWorkbook(
      await buildWorkbook([{ name: 'Wide', rows: [header, header] }]),
    );
    expect(describeWorksheets(workbook, LIMITS)[0]?.problem).toMatch(/25 columns; the limit is 20/);
    expect(syncCodeOf(() => readWorksheetRows(workbook, 'Wide', LIMITS))).toBe('TOO_MANY_COLUMNS');
  });

  it('never evaluates formulas: formula cells keep their text and are flagged', async () => {
    const workbook = await loadWorkbook(
      await buildWorkbook([
        {
          name: 'Students',
          rows: [
            ['Registration Number', 'Student Name'],
            [{ formula: 'CONCAT("DEV-","1")', result: 'DEV-1' }, 'Test'],
          ],
        },
      ]),
    );
    const { rows } = readWorksheetRows(workbook, 'Students', LIMITS);
    expect(rows[0]?.cells[0]).toEqual({
      type: 'formula',
      formula: 'CONCAT("DEV-","1")',
      result: 'DEV-1',
    });
  });

  it('reads real Excel dates as calendar dates', async () => {
    const workbook = await loadWorkbook(
      await buildWorkbook([
        { name: 'S', rows: [['Date of Birth'], [new Date(Date.UTC(2004, 0, 15))]] },
      ]),
    );
    const cell = readWorksheetRows(workbook, 'S', LIMITS).rows[0]?.cells[0];
    expect(cell).toEqual({ type: 'date', value: '2004-01-15' });
    expect(cell && parseDateCell(cell, 'ISO')).toEqual({ ok: true, value: '2004-01-15' });
  });
});

describe('cell normalisation', () => {
  it('normalises ExcelJS values', () => {
    expect(toSourceCell(null)).toEqual({ type: 'blank' });
    expect(toSourceCell('   ')).toEqual({ type: 'blank' });
    expect(toSourceCell({ richText: [{ text: 'Test ' }, { text: 'Student' }] })).toEqual({
      type: 'string',
      value: 'Test Student',
    });
    expect(toSourceCell({ text: 'link', hyperlink: 'https://example.test' })).toEqual({
      type: 'string',
      value: 'link',
    });
    expect(toSourceCell({ error: '#N/A' })).toEqual({ type: 'error', value: '#N/A' });
    expect(toSourceCell({ sharedFormula: 'A1', result: 3 })).toEqual({
      type: 'formula',
      formula: 'A1',
      result: '3',
    });
  });
});

describe('dates', () => {
  it('accepts ISO text dates and rejects impossible ones', () => {
    expect(parseDateText('2026-10-08', 'ISO')).toEqual({ ok: true, value: '2026-10-08' });
    expect(parseDateText('2026-02-30', 'ISO')).toMatchObject({ ok: false, code: 'INVALID_DATE' });
    expect(parseDateText('8 Oct 2026', 'ISO')).toMatchObject({ ok: false, code: 'INVALID_DATE' });
    expect(parseDateText('1850-01-01', 'ISO')).toMatchObject({ ok: false, code: 'INVALID_DATE' });
  });

  it('never guesses ambiguous dates unless a format is configured', () => {
    expect(parseDateText('01/02/2026', 'ISO')).toMatchObject({ ok: false, code: 'AMBIGUOUS_DATE' });
    expect(parseDateText('01/02/2026', 'DMY')).toEqual({ ok: true, value: '2026-02-01' });
    expect(parseDateText('01/02/2026', 'MDY')).toEqual({ ok: true, value: '2026-01-02' });
    expect(parseDateText('31.12.2026', 'DMY')).toEqual({ ok: true, value: '2026-12-31' });
    expect(parseDateText('31/12/2026', 'MDY')).toMatchObject({ ok: false, code: 'INVALID_DATE' });
  });

  it('rejects numbers, formulas and error cells in date fields', () => {
    expect(parseDateCell({ type: 'number', value: 45000 }, 'ISO')).toMatchObject({
      ok: false,
      code: 'INVALID_DATE',
    });
    expect(
      parseDateCell({ type: 'formula', formula: 'TODAY()', result: null }, 'ISO'),
    ).toMatchObject({
      ok: false,
      code: 'FORMULA_NOT_ALLOWED',
    });
    expect(parseDateCell({ type: 'error', value: '#VALUE!' }, 'ISO')).toMatchObject({
      ok: false,
      code: 'CELL_ERROR',
    });
    expect(parseDateCell({ type: 'blank' }, 'ISO')).toEqual({ ok: true, value: null });
  });
});
