const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "2026-07-01" → "01 Jul 2026" (calendar dates are timezone-free). */
export function formatDate(value: string | null | undefined): string {
  return value ? DATE.format(new Date(`${value}T00:00:00Z`)) : '—';
}

export function formatDateTime(value: string): string {
  return DATE_TIME.format(new Date(value));
}
