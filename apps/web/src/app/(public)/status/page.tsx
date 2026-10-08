import { connection } from 'next/server';
import { type ApiHealthResult, getApiHealth } from '@/lib/api-health';
import { loadWebEnv } from '@/lib/env';

/**
 * Phase 1 development status page. Every value shown comes from a live check made while
 * rendering this request — nothing is hard-coded or simulated.
 */
export const metadata = { title: 'System status' };

export default async function DevelopmentStatusPage() {
  // Render per request: a status page must never be served from a build-time snapshot.
  await connection();
  const env = loadWebEnv();
  const api = await getApiHealth(env.API_INTERNAL_URL);

  return (
    <div className="mx-auto flex max-w-xl flex-col justify-center gap-8 px-4 py-12">
      <header>
        <h1 className="text-page-title text-navy-950">DOCVERSITY</h1>
        <p className="mt-1 text-slate-600">Development Environment</p>
      </header>

      <section
        aria-labelledby="status-heading"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2
          id="status-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-500"
        >
          System status
        </h2>
        <ul className="mt-4 divide-y divide-slate-100">
          <StatusRow
            label="Frontend"
            ok
            detail="Rendered by the Next.js server for this request"
            testId="status-frontend"
          />
          <StatusRow
            label="API"
            ok={api.reachable && api.health.status === 'ok'}
            detail={apiDetail(api)}
            testId="status-api"
          />
          {api.reachable &&
            (['database', 'redis', 'storage'] as const).map((service) => (
              <StatusRow
                key={service}
                label={SERVICE_LABELS[service]}
                ok={api.health.services[service] === 'ok'}
                detail={
                  api.health.services[service] === 'ok'
                    ? 'Reported healthy by the API'
                    : 'Reported failing by the API'
                }
                testId={`status-${service}`}
                nested
              />
            ))}
        </ul>
      </section>

      <p className="text-sm text-slate-500">
        Status is checked live on every page load. Reload the page to check again. No product
        features are available in this phase.
      </p>
    </div>
  );
}

const SERVICE_LABELS = {
  database: 'PostgreSQL',
  redis: 'Redis',
  storage: 'Object storage',
} as const;

function apiDetail(api: ApiHealthResult): string {
  if (!api.reachable) return `Unreachable — ${api.reason}`;
  return api.health.status === 'ok'
    ? 'Connected — all dependencies healthy'
    : 'Connected — one or more dependencies failing';
}

function StatusRow({
  label,
  ok,
  detail,
  testId,
  nested = false,
}: {
  label: string;
  ok: boolean;
  detail: string;
  testId: string;
  nested?: boolean;
}) {
  return (
    <li
      data-testid={testId}
      data-status={ok ? 'ok' : 'error'}
      className={`flex items-start gap-3 py-3 ${nested ? 'pl-6' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${ok ? 'bg-green-700' : 'bg-red-700'}`}
      >
        {ok ? '✓' : '✗'}
      </span>
      <div>
        <p className="font-medium">
          {label}:{' '}
          <span className={ok ? 'text-green-800' : 'text-red-800'}>{ok ? 'OK' : 'Not OK'}</span>
        </p>
        <p className="text-sm text-slate-600">{detail}</p>
      </div>
    </li>
  );
}
