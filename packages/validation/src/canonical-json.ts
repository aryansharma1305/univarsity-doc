/** Stable JSON across PostgreSQL jsonb round trips; array order remains meaningful. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error('JSON value required.');
  function ordered(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(ordered);
    if (input !== null && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, ordered(v)]),
      );
    if (typeof input === 'number' && !Number.isFinite(input))
      throw new Error('Finite JSON required.');
    if (typeof input === 'bigint' || typeof input === 'function' || typeof input === 'symbol')
      throw new Error('JSON values required.');
    return input;
  }
  return JSON.stringify(ordered(value));
}
