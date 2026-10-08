import type { ImportDateFormat } from '@docversity/validation';
import type { SourceCell } from './cells.js';

export type DateParse =
  | { ok: true; value: string | null }
  | {
      ok: false;
      code: 'INVALID_DATE' | 'AMBIGUOUS_DATE' | 'FORMULA_NOT_ALLOWED' | 'CELL_ERROR';
      message: string;
    };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEPARATED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Returns YYYY-MM-DD when year/month/day form a real calendar date in the supported range. */
export function calendarDate(year: number, month: number, day: number): string | null {
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const FORMAT_HINT: Record<ImportDateFormat, string> = {
  ISO: 'Use a date cell or YYYY-MM-DD (for example 2026-10-08).',
  DMY: 'Use a date cell, YYYY-MM-DD or DD/MM/YYYY.',
  MDY: 'Use a date cell, YYYY-MM-DD or MM/DD/YYYY.',
};

/**
 * Reads a date field. Real Excel date cells are always accepted. Text is accepted as YYYY-MM-DD,
 * and as DD/MM/YYYY or MM/DD/YYYY ONLY when that format was explicitly chosen — with the default
 * (ISO), "01/02/2026" is rejected as ambiguous instead of guessed. Plain numbers are rejected: a
 * date stored as a General-format number is indistinguishable from a typo.
 */
export function parseDateCell(cell: SourceCell, format: ImportDateFormat): DateParse {
  switch (cell.type) {
    case 'blank':
      return { ok: true, value: null };
    case 'date': {
      const [year, month, day] = cell.value.split('-').map(Number);
      const value = calendarDate(year ?? 0, month ?? 0, day ?? 0);
      return value
        ? { ok: true, value }
        : {
            ok: false,
            code: 'INVALID_DATE',
            message: `The date is outside ${MIN_YEAR}–${MAX_YEAR}.`,
          };
    }
    case 'formula':
      return {
        ok: false,
        code: 'FORMULA_NOT_ALLOWED',
        message: 'Formulas are not allowed. Enter the date itself.',
      };
    case 'error':
      return {
        ok: false,
        code: 'CELL_ERROR',
        message: `The cell contains an Excel error (${cell.value}).`,
      };
    case 'number':
    case 'boolean':
      return {
        ok: false,
        code: 'INVALID_DATE',
        message: `"${String(cell.value)}" is not a date. ${FORMAT_HINT[format]}`,
      };
    case 'string':
      return parseDateText(cell.value.trim(), format);
  }
}

export function parseDateText(text: string, format: ImportDateFormat): DateParse {
  const iso = ISO.exec(text);
  if (iso) {
    const value = calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return value
      ? { ok: true, value }
      : { ok: false, code: 'INVALID_DATE', message: `"${text}" is not a real date.` };
  }
  const separated = SEPARATED.exec(text);
  if (separated) {
    const first = Number(separated[1]);
    const second = Number(separated[2]);
    const year = Number(separated[3]);
    if (format === 'ISO') {
      return {
        ok: false,
        code: 'AMBIGUOUS_DATE',
        message: `"${text}" is ambiguous (day/month order is unknown). Use YYYY-MM-DD, or choose the date format when mapping columns.`,
      };
    }
    const value =
      format === 'DMY' ? calendarDate(year, second, first) : calendarDate(year, first, second);
    return value
      ? { ok: true, value }
      : {
          ok: false,
          code: 'INVALID_DATE',
          message: `"${text}" is not a real date. ${FORMAT_HINT[format]}`,
        };
  }
  return {
    ok: false,
    code: 'INVALID_DATE',
    message: `"${text}" is not a date. ${FORMAT_HINT[format]}`,
  };
}
