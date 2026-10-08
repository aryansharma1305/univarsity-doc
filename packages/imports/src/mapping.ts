import {
  type ColumnMapping,
  type ImportColumn,
  type ImportMapping,
  type ImportSheet,
  normalizeImportHeader,
  STUDENT_IMPORT_FIELDS,
} from '@docversity/validation';

/**
 * Deterministic mapping suggestions: a column is suggested for a field when its normalised header
 * equals the field's normalised label or one of its aliases. Fields are matched in catalogue order
 * and columns left to right; a column is suggested for at most one field. No fuzzy matching, no AI —
 * the administrator always reviews and confirms the mapping.
 */
export function suggestStudentMapping(columns: readonly ImportColumn[]): ColumnMapping {
  const byHeader = new Map<string, number>();
  for (const column of columns) {
    if (column.sensitive) continue;
    const normalized = normalizeImportHeader(column.header);
    if (normalized && !byHeader.has(normalized)) byHeader.set(normalized, column.index);
  }
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const field of STUDENT_IMPORT_FIELDS) {
    const candidates = [normalizeImportHeader(field.label), ...field.aliases];
    let match: number | null = null;
    for (const candidate of candidates) {
      const index = byHeader.get(candidate);
      if (index !== undefined && !used.has(index)) {
        match = index;
        break;
      }
    }
    if (match !== null) used.add(match);
    mapping[field.key] = match;
  }
  return mapping;
}

export interface MappingProblem {
  path: string;
  message: string;
}

/** Checks a submitted mapping against the discovered worksheets. Returns field-level problems. */
export function validateStudentMapping(
  mapping: ImportMapping,
  sheets: readonly ImportSheet[],
): MappingProblem[] {
  const sheet = sheets.find((candidate) => candidate.name === mapping.worksheet);
  if (!sheet) return [{ path: 'worksheet', message: 'Choose one of the worksheets in this file.' }];
  if (sheet.problem) return [{ path: 'worksheet', message: sheet.problem }];

  const problems: MappingProblem[] = [];
  const columnsInUse = new Map<number, string>();
  for (const field of STUDENT_IMPORT_FIELDS) {
    const column = mapping.columns[field.key] ?? null;
    if (column === null) {
      if (field.key === 'academicSessionCode' && mapping.defaultAcademicSessionId) continue;
      if (field.key === 'academicSessionCode') {
        problems.push({
          path: 'columns.academicSessionCode',
          message: 'Choose the column for Academic Session Code, or one session for every row.',
        });
        continue;
      }
      if (field.required) {
        problems.push({
          path: `columns.${field.key}`,
          message: `Choose the column for ${field.label}.`,
        });
      }
      continue;
    }
    if (column > sheet.columnCount) {
      problems.push({
        path: `columns.${field.key}`,
        message: 'This column does not exist in the worksheet.',
      });
      continue;
    }
    if (sheet.columns.find((candidate) => candidate.index === column)?.sensitive) {
      problems.push({
        path: `columns.${field.key}`,
        message: 'This column holds identity numbers and is never imported.',
      });
      continue;
    }
    const other = columnsInUse.get(column);
    if (other) {
      problems.push({
        path: `columns.${field.key}`,
        message: `This column is already mapped to ${other}. Each column can be mapped to one field only.`,
      });
      continue;
    }
    columnsInUse.set(column, field.label);
  }
  return problems;
}
