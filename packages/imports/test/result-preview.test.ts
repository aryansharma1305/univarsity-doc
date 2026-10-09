import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { ResultImportField, ResultImportSheet } from '@docversity/validation';
import { toSourceCell } from '../src/cells.js';
import { suggestResultMapping, validateResultMapping } from '../src/mapping.js';
import { buildResultErrorReport } from '../src/report.js';
import {
  componentConfigurationFromCurriculum,
  type ResultValidationContext,
  validateResultRows,
} from '../src/result-rows.js';
import type { RawRowData } from '../src/student-rows.js';
import { buildResultTemplate } from '../src/template.js';
import { buildWorkbook } from '../src/testing.js';
import { describeResultWorksheets, loadWorkbook } from '../src/workbook.js';

const LIMITS = { maxRows: 100, maxColumns: 20 };

function columns(headers: string[]) {
  return headers.map((header, index) => ({
    index: index + 1,
    letter: String.fromCharCode(65 + index),
    header,
    sensitive: /aadhaar|passport/i.test(header),
    values: null,
  }));
}

function sheet(headers: string[], problem: string | null = null): ResultImportSheet {
  const cols = columns(headers).map(({ values: _values, ...rest }) => rest);
  return {
    name: 'Results',
    rowCount: 3,
    columnCount: headers.length,
    columns: cols,
    suggestedMapping: {},
    problem,
  };
}

describe('suggestResultMapping', () => {
  it('matches template headers and common aliases deterministically', () => {
    const mapping = suggestResultMapping(
      columns(['Reg No', 'Sub Code', 'Internal', 'Theory', 'Total Marks', 'Remarks']),
    );
    expect(mapping).toMatchObject({
      registrationNumber: 1,
      subjectCode: 2,
      internalMarks: 3,
      externalMarks: 4,
      totalMarks: 5,
      practicalMarks: null,
      grade: null,
    });
  });

  it('never suggests identity-number columns', () => {
    const mapping = suggestResultMapping(columns(['Aadhaar Registration Number', 'Subject Code']));
    expect(mapping.registrationNumber).toBeNull();
  });
});

describe('validateResultMapping', () => {
  const headers = ['Registration Number', 'Subject Code', 'Internal Marks', 'Total Marks'];

  it('accepts a complete mapping', () => {
    expect(
      validateResultMapping(
        {
          worksheet: 'Results',
          columns: { registrationNumber: 1, subjectCode: 2, internalMarks: 3, totalMarks: 4 },
        },
        [sheet(headers)],
      ),
    ).toEqual([]);
  });

  it('reports missing registration number and subject code mappings', () => {
    const problems = validateResultMapping({ worksheet: 'Results', columns: { totalMarks: 4 } }, [
      sheet(headers),
    ]);
    expect(problems.map((problem) => problem.path)).toEqual([
      'columns.registrationNumber',
      'columns.subjectCode',
    ]);
  });

  it('detects a column mapped twice', () => {
    const problems = validateResultMapping(
      {
        worksheet: 'Results',
        columns: { registrationNumber: 1, subjectCode: 2, internalMarks: 3, totalMarks: 3 },
      },
      [sheet(headers)],
    );
    expect(problems).toEqual([
      expect.objectContaining({
        path: 'columns.totalMarks',
        message: expect.stringContaining('already mapped') as string,
      }),
    ]);
  });

  it('requires at least one marks column and every component the curriculum requires', () => {
    const problems = validateResultMapping(
      { worksheet: 'Results', columns: { registrationNumber: 1, subjectCode: 2 } },
      [sheet(headers)],
      ['practicalMarks'],
    );
    expect(problems.map((problem) => problem.path)).toEqual([
      'columns.practicalMarks',
      'columns.totalMarks',
    ]);
  });

  it('rejects unknown worksheets, missing columns, sensitive columns and problem sheets', () => {
    expect(validateResultMapping({ worksheet: 'Other', columns: {} }, [sheet(headers)])).toEqual([
      expect.objectContaining({ path: 'worksheet' }),
    ]);
    expect(
      validateResultMapping({ worksheet: 'Results', columns: {} }, [sheet(headers, 'Empty.')]),
    ).toEqual([{ path: 'worksheet', message: 'Empty.' }]);
    const problems = validateResultMapping(
      {
        worksheet: 'Results',
        columns: { registrationNumber: 9, subjectCode: 2, totalMarks: 5 },
      },
      [sheet([...headers, 'Passport No'])],
    );
    expect(problems.map((problem) => problem.path)).toEqual([
      'columns.registrationNumber',
      'columns.totalMarks',
    ]);
  });
});

describe('describeResultWorksheets', () => {
  it('describes sheets with results suggestions and without collected cell values', async () => {
    const bytes = await buildWorkbook([
      {
        name: 'Results',
        rows: [
          ['Registration Number', 'Subject Code', 'Total Marks'],
          ['DEV-RES-0001', 'SUB1', 50],
          ['DEV-RES-0002', 'SUB1', 50],
          ['DEV-RES-0003', 'SUB1', 50],
        ],
      },
      { name: 'Empty', rows: [['Only a header']] },
    ]);
    const sheets = describeResultWorksheets(await loadWorkbook(bytes), LIMITS);
    expect(sheets[0]).toMatchObject({
      name: 'Results',
      rowCount: 3,
      problem: null,
      suggestedMapping: { registrationNumber: 1, subjectCode: 2, totalMarks: 3 },
    });
    expect(sheets[0]?.columns[1]).toEqual({
      index: 2,
      letter: 'B',
      header: 'Subject Code',
      sensitive: false,
    });
    expect(JSON.stringify(sheets)).not.toContain('SUB1');
    expect(sheets[1]?.problem).toMatch(/no data rows/);
  });
});

describe('buildResultTemplate', () => {
  it('has a text-formatted Results sheet without grade or context columns', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(await buildResultTemplate()) as unknown as Parameters<
        ExcelJS.Workbook['xlsx']['load']
      >[0],
    );
    const results = workbook.getWorksheet('Results');
    expect(results).toBeDefined();
    const headers = (results?.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual([
      'Registration Number',
      'Subject Code',
      'Internal Marks',
      'External Marks',
      'Practical Marks',
      'Other Marks',
      'Total Marks',
    ]);
    expect(results?.getColumn(1).numFmt).toBe('@');
    expect(results?.rowCount).toBe(1);
    expect(workbook.getWorksheet('Instructions')).toBeDefined();
    const sheets = describeResultWorksheets(workbook, LIMITS);
    expect(sheets.find((s) => s.name === 'Results')?.suggestedMapping).toMatchObject({
      registrationNumber: 1,
      subjectCode: 2,
      internalMarks: 3,
      externalMarks: 4,
      practicalMarks: 5,
      otherMarks: 6,
      totalMarks: 7,
    });
  });
});

describe('buildResultErrorReport', () => {
  it('formula-escapes text and states that nothing was saved', async () => {
    const bytes = await buildResultErrorReport(
      [
        {
          rowNumber: 2,
          registrationNumber: '=HYPERLINK("x")',
          subjectCode: '+SUB',
          errors: [
            { code: 'REQUIRED', severity: 'error', field: 'subjectCode', message: 'Missing.' },
          ],
          warnings: [],
        },
      ],
      {
        filename: 'results.xlsx',
        worksheet: 'Results',
        generatedAt: new Date('2026-10-10T00:00:00Z'),
        context: [['Examination', 'EXM-1 Synthetic']],
        counts: { 'Total rows': 1 },
      },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(bytes) as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
    );
    const issues = workbook.getWorksheet('Issues');
    expect(issues?.getCell('B2').value).toBe('\'=HYPERLINK("x")');
    expect(issues?.getCell('C2').value).toBe("'+SUB");
    expect(issues?.getCell('F2').value).toEqual(expect.stringContaining('Subject Code: Missing.'));
    expect(workbook.getWorksheet('Summary')?.getCell('B2').value).toMatch(/Preview only/);
  });
});

describe('validateResultRows (Phase 10B integration rules)', () => {
  const mapping: Record<ResultImportField, string | null> = {
    registrationNumber: 'A',
    subjectCode: 'B',
    internalMarks: 'C',
    externalMarks: null,
    practicalMarks: null,
    otherMarks: null,
    totalMarks: 'D',
    grade: 'E',
  };
  const context: ResultValidationContext = {
    academicPeriod: '1',
    expectedCurriculumId: 'cur-a',
    gradesAccepted: false,
    registrationsWithResults: new Set(['reg-results']),
    registrations: new Map([
      [
        '000123',
        {
          id: 'reg-1',
          registrationNumberNormalized: '000123',
          curriculumId: 'cur-a',
          status: 'ACTIVE',
        },
      ],
      [
        'OTHER-CUR',
        {
          id: 'reg-2',
          registrationNumberNormalized: 'OTHER-CUR',
          curriculumId: 'cur-b',
          status: 'ACTIVE',
        },
      ],
      [
        'SUSP',
        {
          id: 'reg-3',
          registrationNumberNormalized: 'SUSP',
          curriculumId: 'cur-a',
          status: 'SUSPENDED',
        },
      ],
      [
        'HASRES',
        {
          id: 'reg-results',
          registrationNumberNormalized: 'HASRES',
          curriculumId: 'cur-a',
          status: 'ACTIVE',
        },
      ],
    ]),
    curriculumSubjects: new Map([
      [
        'cur-a',
        [
          {
            id: 'ps-1',
            curriculumId: 'cur-a',
            subjectCode: 'SUB1',
            academicPeriod: '1',
            maxMarks: 100,
            componentConfiguration: { internalMax: 30 },
          },
        ],
      ],
    ]),
  };

  function row(
    rowNumber: number,
    cells: Record<string, unknown>,
  ): { rowNumber: number; rawData: RawRowData } {
    return {
      rowNumber,
      rawData: Object.fromEntries(
        Object.entries(cells).map(([key, value]) => [key, toSourceCell(value)]),
      ),
    };
  }

  const codes = (
    outcome: { errors: { code: string }[]; warnings: { code: string }[] } | undefined,
  ) => [
    ...(outcome?.errors.map((issue) => issue.code) ?? []),
    ...(outcome?.warnings.map((issue) => issue.code) ?? []),
  ];

  it('keeps leading zeros of text registration numbers and treats 0 as a mark', () => {
    const [outcome] = validateResultRows(
      [row(2, { A: '000123', B: 'sub1', C: 0, D: 0 })],
      mapping,
      context,
    );
    expect(outcome?.status).toBe('VALID');
    expect(outcome?.normalizedData.registrationNumberNormalized).toBe('000123');
    expect(outcome?.normalizedData.values.internalMarks).toBe('0');
  });

  it('rejects formulas and Excel errors in marks (cached results are never used)', () => {
    const [outcome] = validateResultRows(
      [
        row(2, {
          A: '000123',
          B: 'SUB1',
          C: { formula: 'A1*2', result: 20 },
          D: { error: '#N/A' },
        }),
      ],
      mapping,
      context,
    );
    expect(outcome?.status).toBe('ERROR');
    expect(codes(outcome)).toEqual(expect.arrayContaining(['FORMULA_NOT_ALLOWED', 'INVALID_CELL']));
    expect(outcome?.normalizedData.values.internalMarks).toBeUndefined();
  });

  it('rejects registrations on another curriculum version', () => {
    const [outcome] = validateResultRows(
      [row(2, { A: 'OTHER-CUR', B: 'SUB1', D: 50 })],
      mapping,
      context,
    );
    expect(codes(outcome)).toEqual(['CURRICULUM_MISMATCH']);
  });

  it('warns about inactive registrations, existing results and ignored grades', () => {
    const outcomes = validateResultRows(
      [
        row(2, { A: 'SUSP', B: 'SUB1', D: 50 }),
        row(3, { A: 'HASRES', B: 'SUB1', D: 50 }),
        row(4, { A: '000123', B: 'SUB1', D: 50, E: 'A' }),
      ],
      mapping,
      context,
    );
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['WARNING', 'WARNING', 'WARNING']);
    expect(outcomes.map(codes)).toEqual([
      ['REGISTRATION_NOT_ACTIVE'],
      ['EXISTING_RESULT'],
      ['GRADE_NOT_ACCEPTED'],
    ]);
  });

  it('reports over-precision, negative and over-maximum marks and duplicates', () => {
    const outcomes = validateResultRows(
      [
        row(2, { A: '000123', B: 'SUB1', C: 10.555, D: 50 }),
        row(3, { A: '000123', B: 'SUB1', C: -1, D: 101 }),
      ],
      mapping,
      context,
    );
    expect(codes(outcomes[0])).toEqual(['INVALID_NUMBER']);
    expect(codes(outcomes[1])).toEqual(
      expect.arrayContaining(['DUPLICATE_ROW', 'NEGATIVE_MARKS_NOT_ALLOWED', 'EXCEEDS_MAX_MARKS']),
    );
  });
});

describe('componentConfigurationFromCurriculum', () => {
  it('translates Phase 7B named components by exact label/alias and never guesses others', () => {
    expect(
      componentConfigurationFromCurriculum({
        components: [
          { name: 'Internal', maxMarks: 30, passMarks: null },
          { name: 'Theory', maxMarks: 50, passMarks: 20 },
          { name: 'Lab Work', maxMarks: 20, passMarks: null },
        ],
      }),
    ).toEqual({
      configuration: {
        internalMax: 30,
        internalRequired: true,
        externalMax: 50,
        externalRequired: true,
      },
      unrecognized: ['Lab Work'],
    });
  });

  it('treats several components matching one field as unrecognised, and no components as none', () => {
    expect(
      componentConfigurationFromCurriculum({
        components: [
          { name: 'Viva', maxMarks: 10 },
          { name: 'Seminar', maxMarks: 10 },
        ],
      }),
    ).toEqual({ configuration: null, unrecognized: ['Viva', 'Seminar'] });
    expect(componentConfigurationFromCurriculum(null)).toEqual({
      configuration: null,
      unrecognized: [],
    });
  });
});
