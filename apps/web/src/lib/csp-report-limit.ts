/**
 * Log-volume guard: per client (first X-Forwarded-For hop, set by the Caddy edge) and in total,
 * per minute. Reports over the limit are accepted (204) but not logged.
 * shortcut: per-process memory, resets on restart; fine for one web container.
 */
const PER_CLIENT_PER_MINUTE = 20;
const TOTAL_PER_MINUTE = 600;
let windowStart = 0;
let total = 0;
const perClient = new Map<string, number>();

export function allowReport(client: string, now = Date.now()): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    total = 0;
    perClient.clear();
  }
  const used = perClient.get(client) ?? 0;
  if (used >= PER_CLIENT_PER_MINUTE || total >= TOTAL_PER_MINUTE) return false;
  perClient.set(client, used + 1);
  total += 1;
  return true;
}
