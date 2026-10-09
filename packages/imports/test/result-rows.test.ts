import { describe, expect, it } from 'vitest';
import { validateResultRows, type ResultValidationContext } from '../src/result-rows.js';
import type { RawRowData } from '../src/student-rows.js';
import type { ResultImportField } from '@docversity/validation';

describe('validateResultRows', () => {
  const mapping: Record<ResultImportField, string | null> = {
    registrationNumber: 'A',
    subjectCode: 'B',
    internalMarks: 'C',
    externalMarks: 'D',
    practicalMarks: null,
    otherMarks: null,
    totalMarks: 'E',
    grade: 'F',
  };

  const mockContext: ResultValidationContext = {
    academicPeriod: 'SEM-1',
    registrations: new Map([
      ['REG1', { id: 'reg1-id', registrationNumberNormalized: 'REG1', curriculumId: 'cur1-id' }],
      ['REG2', { id: 'reg2-id', registrationNumberNormalized: 'REG2', curriculumId: null }],
    ]),
    curriculumSubjects: new Map([
      [
        'cur1-id',
        [
          {
            id: 'ps1-id',
            curriculumId: 'cur1-id',
            subjectCode: 'SUB1',
            academicPeriod: 'SEM-1',
            maxMarks: 100,
            componentConfiguration: { internalMax: 30, externalMax: 70, internalRequired: true, externalRequired: true },
          },
          {
            id: 'ps2-id',
            curriculumId: 'cur1-id',
            subjectCode: 'SUB2',
            academicPeriod: 'SEM-2',
            maxMarks: 100,
          },
        ],
      ],
    ]),
  };

  function createRow(
    rowNumber: number,
    data: Record<string, string>,
    numericFields: string[] = []
  ): { rowNumber: number; rawData: RawRowData } {
    const rawData: RawRowData = {};
    for (const [col, value] of Object.entries(data)) {
      if (numericFields.includes(col)) {
        rawData[col] = { type: 'number', value: Number(value) } as any;
      } else {
        rawData[col] = { type: 'string', value };
      }
    }
    return { rowNumber, rawData };
  }

  it('should return VALID for a correct row', () => {
    const rows = [createRow(2, { A: 'REG1', B: 'SUB1', C: '25', D: '60', E: '85', F: 'A' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe('VALID');
    expect(outcomes[0].errors).toHaveLength(0);
  });

  it('should return ERROR for numeric registration number cells', () => {
    const rows = [createRow(2, { A: '12345', B: 'SUB1', C: '25', D: '60' }, ['A'])];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'registrationNumber', code: 'NUMERIC_REGISTRATION' })
    );
  });

  it('should return ERROR for missing registration number', () => {
    const rows = [createRow(2, { B: 'SUB1', E: '85' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'registrationNumber', code: 'REQUIRED' })
    );
  });

  it('should return ERROR for student with no curriculum assigned', () => {
    const rows = [createRow(2, { A: 'REG2', B: 'SUB1', E: '85' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
  });

  it('should return ERROR for academic period mismatch', () => {
    const rows = [createRow(2, { A: 'REG1', B: 'SUB2', C: '25', D: '60', E: '85' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'subjectCode', code: 'SUBJECT_PERIOD_MISMATCH' })
    );
  });

  it('should return ERROR when marks exceed configured max', () => {
    const rows = [createRow(2, { A: 'REG1', B: 'SUB1', C: '35', D: '75', E: '105' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors[0].code).toBe('EXCEEDS_MAX_MARKS');
  });

  it('should return ERROR for negative marks or invalid numeric strings or precision', () => {
    const rows = [createRow(2, { A: 'REG1', B: 'SUB1', C: '-5', D: 'NaN_Value', E: '12.345' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'internalMarks', code: 'NEGATIVE_MARKS_NOT_ALLOWED' })
    );
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'externalMarks', code: 'INVALID_NUMBER' })
    );
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'totalMarks', code: 'INVALID_NUMBER' }) // 12.345 fails regex
    );
  });

  it('should return ERROR if required components are missing even if grade is present', () => {
    // SUB1 requires C (internal) and D (external). Provide grade only.
    const rows = [createRow(2, { A: 'REG1', B: 'SUB1', F: 'A' })]; 
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    const codes = outcomes[0].errors.map(e => e.field);
    expect(codes).toContain('internalMarks');
    expect(codes).toContain('externalMarks');
    expect(outcomes[0].errors[0].code).toBe('REQUIRED_COMPONENT_MISSING');
  });

  it('should detect duplicates with examination context', () => {
    const ctx = {
      ...mockContext,
      examinationContext: { examinationId: 'exam-1', attemptNumber: 1 },
    };
    const rows = [
      createRow(2, { A: 'REG1', B: 'SUB1', C: '25', D: '60' }),
      createRow(3, { A: 'REG1', B: 'SUB1', C: '20', D: '50' }),
    ];
    const outcomes = validateResultRows(rows, mapping, ctx);
    expect(outcomes[0].status).toBe('VALID');
    expect(outcomes[1].status).toBe('ERROR');
    expect(outcomes[1].errors).toContainEqual(
      expect.objectContaining({ field: 'subjectCode', code: 'DUPLICATE_ROW' })
    );
  });
});
