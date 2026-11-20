/**
 * Sink for `report-uri /csp-report` (lib/csp.ts). Writes one JSON line per violation to the web
 * container log so deploy/ops/alert/healthcheck.sh can count them. Only the directive, the blocked
 * source reduced to its origin (or a keyword such as `inline`/`eval`) and the page path are logged —
 * never query strings, script samples or anything else from the report.
 */
import { allowReport } from '@/lib/csp-report-limit';

const MAX_BODY_BYTES = 8 * 1024;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function origin(value: unknown): string {
  if (typeof value !== 'string' || value === '') return 'unknown';
  try {
    return new URL(value).origin;
  } catch {
    return value.slice(0, 32); // keywords: inline, eval, data, blob
  }
}

function pathOf(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  try {
    return new URL(value).pathname.slice(0, 128);
  } catch {
    return 'unknown';
  }
}

/** Reads at most `limit` bytes; null when the body is larger (also for chunked bodies). */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request): Promise<Response> {
  const body = await readCapped(request, MAX_BODY_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  let report: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    const inner = (parsed as { 'csp-report'?: unknown })['csp-report'];
    if (inner && typeof inner === 'object') report = inner as Record<string, unknown>;
  } catch {
    // fall through: malformed body
  }
  if (!report) return new Response(null, { status: 400 });
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!allowReport(client)) return new Response(null, { status: 204 });
  console.warn(
    JSON.stringify({
      level: 'warn',
      msg: 'csp-violation',
      time: new Date().toISOString(),
      disposition: report.disposition === 'enforce' ? 'enforce' : 'report',
      directive: text(report['effective-directive'] ?? report['violated-directive'])
        .split(' ')[0]
        ?.slice(0, 32),
      blocked: origin(report['blocked-uri']),
      page: pathOf(report['document-uri']),
    }),
  );
  return new Response(null, { status: 204 });
}
