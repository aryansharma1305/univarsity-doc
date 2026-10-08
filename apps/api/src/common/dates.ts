/** `Date` (as returned for PostgreSQL `date` columns, UTC midnight) → "YYYY-MM-DD". */
export function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** "YYYY-MM-DD" → `Date` at UTC midnight; null/undefined pass through. */
export function fromDateOnly(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}
