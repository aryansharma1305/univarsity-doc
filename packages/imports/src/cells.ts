/**
 * Spreadsheet cells, normalised to a small JSON-safe union. Formulas are never evaluated: a formula
 * cell keeps its formula text (and Excel's cached result for display only) and is rejected wherever
 * an import field reads it — official data must be typed values, not computed ones.
 */
export type SourceCell =
  | { type: 'blank' }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  /** An Excel date cell, as YYYY-MM-DD (time of day dropped). */
  | { type: 'date'; value: string }
  | { type: 'formula'; formula: string; result: string | null }
  | { type: 'error'; value: string };

const BLANK: SourceCell = { type: 'blank' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function richText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.richText)) return null;
  return value.richText
    .map((run: unknown) => (isRecord(run) && typeof run.text === 'string' ? run.text : ''))
    .join('');
}

function dateToIso(value: Date): string | null {
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function plainResult(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateToIso(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isRecord(value) && typeof value.error === 'string') return value.error;
  return richText(value);
}

/** Converts an ExcelJS cell value (`cell.value`) to a SourceCell. */
export function toSourceCell(value: unknown): SourceCell {
  if (value === null || value === undefined) return BLANK;
  if (typeof value === 'string') return value.trim() === '' ? BLANK : { type: 'string', value };
  if (typeof value === 'number') return Number.isFinite(value) ? { type: 'number', value } : BLANK;
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (value instanceof Date) {
    const iso = dateToIso(value);
    return iso ? { type: 'date', value: iso } : { type: 'error', value: '#DATE!' };
  }
  if (isRecord(value)) {
    if (typeof value.formula === 'string' || typeof value.sharedFormula === 'string') {
      const formula =
        typeof value.formula === 'string' ? value.formula : String(value.sharedFormula);
      return { type: 'formula', formula, result: plainResult(value.result) };
    }
    if (typeof value.error === 'string') return { type: 'error', value: value.error };
    const rich = richText(value);
    if (rich !== null) return rich.trim() === '' ? BLANK : { type: 'string', value: rich };
    if ('text' in value) {
      // Hyperlink cell: the visible text (itself possibly rich text).
      const text = typeof value.text === 'string' ? value.text : richText(value.text);
      return text && text.trim() !== '' ? { type: 'string', value: text } : BLANK;
    }
  }
  return BLANK;
}

/** How a cell is shown to people (source preview, reports). */
export function cellDisplay(cell: SourceCell): string | null {
  switch (cell.type) {
    case 'blank':
      return null;
    case 'string':
      return cell.value;
    case 'number':
    case 'boolean':
    case 'date':
    case 'error':
      return String(cell.value);
    case 'formula':
      return `=${cell.formula}`;
  }
}

export function isBlank(cell: SourceCell | undefined): boolean {
  return !cell || cell.type === 'blank';
}
