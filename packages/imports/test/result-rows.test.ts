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
            maxMarks: 100,
            componentConfiguration: { internalMax: 30, externalMax: 70 },
          },
        ],
      ],
    ]),
  };

  function createRow(rowNumber: number, data: Record<string, string>): { rowNumber: number; rawData: RawRowData } {
    const rawData: RawRowData = {};
    for (const [col, value] of Object.entries(data)) {
      rawData[col] = { type: 'string', value };
    }
    return { rowNumber, rawData };
  }

  it('should return VALID for a correct row', () => {
    const rows = [
      createRow(2, {
        A: 'REG1',
        B: 'SUB1',
        C: '25',
        D: '60',
        E: '85',
        F: 'A',
      }),
    ];

    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe('VALID');
    expect(outcomes[0].errors).toHaveLength(0);
    expect(outcomes[0].normalizedData.registrationNumberNormalized).toBe('REG1');
    expect(outcomes[0].normalizedData.programSubjectId).toBe('ps1-id');
  });

  it('should return ERROR for missing registration number', () => {
    const rows = [createRow(2, { B: 'SUB1', E: '85' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'registrationNumber', code: 'REQUIRED' })
    );
  });

  it('should return ERROR for unknown registration number', () => {
    const rows = [createRow(2, { A: 'UNKNOWN', B: 'SUB1', E: '85' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'registrationNumber', code: 'REGISTRATION_NOT_FOUND' })
    );
  });

  it('should return ERROR for student with no curriculum assigned', () => {
    const rows = [createRow(2, { A: 'REG2', B: 'SUB1', E: '85' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'subjectCode', code: 'CURRICULUM_NOT_ASSIGNED' })
    );
  });

  it('should return ERROR for unknown subject code in curriculum', () => {
    const rows = [createRow(2, { A: 'REG1', B: 'UNKNOWN_SUB', E: '85' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'subjectCode', code: 'SUBJECT_NOT_FOUND' })
    );
  });

  it('should return ERROR when marks exceed configured max', () => {
    const rows = [
      createRow(2, {
        A: 'REG1',
        B: 'SUB1',
        C: '35', // internalMax is 30
        D: '75', // externalMax is 70
        E: '105', // maxMarks is 100
      }),
    ];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    const codes = outcomes[0].errors.map((e) => e.field);
    expect(codes).toContain('internalMarks');
    expect(codes).toContain('externalMarks');
    expect(codes).toContain('totalMarks');
    expect(outcomes[0].errors[0].code).toBe('EXCEEDS_MAX_MARKS');
  });

  it('should return ERROR for negative marks or invalid numeric strings', () => {
    const rows = [createRow(2, { A: 'REG1', B: 'SUB1', C: '-5', D: 'NaN_Value' })];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'internalMarks', code: 'NEGATIVE_MARKS_NOT_ALLOWED' })
    );
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'externalMarks', code: 'INVALID_NUMBER' })
    );
  });

  it('should return ERROR if no marks or grade are provided', () => {
    const rows = [createRow(2, { A: 'REG1', B: 'SUB1' })]; // missing C, D, E, F
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('ERROR');
    expect(outcomes[0].errors).toContainEqual(
      expect.objectContaining({ field: 'totalMarks', code: 'NO_MARKS_OR_GRADE' })
    );
  });

  it('should return ERROR for duplicate rows within the same file', () => {
    const rows = [
      createRow(2, { A: 'REG1', B: 'SUB1', E: '85' }),
      createRow(3, { A: 'REG1', B: 'SUB1', E: '90' }),
    ];
    const outcomes = validateResultRows(rows, mapping, mockContext);
    expect(outcomes[0].status).toBe('VALID');
    expect(outcomes[1].status).toBe('ERROR');
    expect(outcomes[1].errors).toContainEqual(
      expect.objectContaining({ field: 'subjectCode', code: 'DUPLICATE_ROW' })
    );
  });
});
