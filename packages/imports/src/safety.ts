/**
 * Spreadsheet formula-injection guard for generated files (error reports): a text cell starting with
 * "=", "+", "-", "@", a tab or a carriage return could be interpreted as a formula when the file is
 * opened or re-saved as CSV. Such values are prefixed with an apostrophe so they stay plain text.
 */
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function escapeSpreadsheetText(value: string): string {
  return DANGEROUS_PREFIX.test(value) ? `'${value}` : value;
}

/** Strips any path and control characters from an uploaded filename (display metadata only). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const limited = cleaned.length > 200 ? cleaned.slice(cleaned.length - 200) : cleaned;
  return limited === '' || limited === '.' || limited === '..' ? 'upload.xlsx' : limited;
}
