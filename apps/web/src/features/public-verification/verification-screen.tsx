'use client';
import { useEffect, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { ShieldCheckIcon, ArrowLeftIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import {
  officialVerificationResponseSchema,
  type OfficialVerificationResponse,
  type PublicVerificationService,
} from '@docversity/validation';
import { ApiError, studentRequest } from '@/lib/api';
const titles: Record<PublicVerificationService, string> = {
  'admission-letter': 'Verify Admission Letter',
  certificate: 'Verify Certificate',
  registration: 'Verify Registration',
  result: 'Check Result',
};
const labels: Record<PublicVerificationService, string> = {
  'admission-letter': 'Admission letter number',
  certificate: 'Certificate number',
  registration: 'Registration number',
  result: 'Registration number',
};
export function VerificationScreen({ service }: { service: PublicVerificationService }) {
  const [reference, setReference] = useState(''),
    [token, setToken] = useState(''),
    [period, setPeriod] = useState(''),
    [exam, setExam] = useState('');
  const [response, setResponse] = useState<OfficialVerificationResponse | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const privateLookup = service === 'registration' || service === 'result';
  useEffect(() => {
    if (privateLookup) return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const value = hash.get('token');
    if (value && /^[A-Za-z0-9_-]{43}$/.test(value))
      queueMicrotask(() => {
        setToken(value);
      });
    // Opaque QR credentials stay out of URLs sent to servers, referrers and history.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, [privateLookup]);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setResponse(null);
    setExam('');
    try {
      const result = await studentRequest(
        'POST',
        `public/verify/${service}`,
        officialVerificationResponseSchema,
        {
          body: {
            contractVersion: 2,
            ...(token ? { token } : { reference }),
            ...(service === 'result' && period ? { periodNumber: Number(period) } : {}),
          },
        },
      );
      setResponse(result);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? 'Too many checks. Wait a minute, then try again.'
          : 'Verification could not be completed. Please try again shortly.',
      );
    } finally {
      setBusy(false);
    }
  }
  const results = (response?.results ?? []).filter((r) => !exam || r.examinationId === exam);
  const positive = response && ['VALID', 'ISSUED', 'ACTIVE'].includes(response.status);
  return (
    <section className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Link
        href="/"
        className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-brand underline-offset-4 hover:underline print:hidden"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Back to home
      </Link>
      <div className="mb-8 flex items-start gap-4">
        <ShieldCheckIcon className="mt-1 size-7 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <h1 className="text-page-title text-navy-950">{titles[service]}</h1>
          <p className="mt-3 max-w-prose text-body text-muted-foreground">
            {privateLookup
              ? 'Use your registration number while signed in to your own student account.'
              : 'Enter the number printed on your issued document, or use its secure verification QR link.'}
          </p>
        </div>
      </div>
      {privateLookup && (
        <p className="mb-6 text-sm print:hidden">
          <Link
            className="font-medium text-brand underline underline-offset-4"
            href="/student/login"
          >
            Student Sign in
          </Link>{' '}
          ·{' '}
          <Link className="text-brand underline underline-offset-4" href="/student/register">
            Activate your account
          </Link>
        </p>
      )}
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7 print:hidden"
        aria-busy={busy}
      >
        <div>
          <label htmlFor="verification-reference" className="mb-2 block text-sm font-medium">
            {labels[service]}
          </label>
          <Input
            className="min-h-11"
            id="verification-reference"
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setToken('');
              setResponse(null);
            }}
            required={!token}
            disabled={busy}
            minLength={3}
            maxLength={128}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-describedby="reference-help"
          />
          <p id="reference-help" className="mt-2 text-sm text-muted-foreground">
            Keep all leading zeros.{' '}
            {token
              ? 'A secure QR token is ready to check. Entering a number replaces it.'
              : 'Enter the identifier exactly as issued.'}
          </p>
        </div>
        {!privateLookup && (
          <div>
            <label htmlFor="verification-token" className="mb-2 block text-sm font-medium">
              Secure QR token (optional)
            </label>
            <Input
              className="min-h-11"
              id="verification-token"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setReference('');
                setResponse(null);
              }}
              disabled={busy}
              maxLength={43}
              minLength={43}
              pattern="[A-Za-z0-9_-]{43}"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        {service === 'result' && (
          <div>
            <label htmlFor="verification-period" className="mb-2 block text-sm font-medium">
              Semester / academic year
            </label>
            <select
              id="verification-period"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setResponse(null);
              }}
              disabled={busy}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All published periods</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i + 1}>
                  Period {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" className="min-h-11" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
              Checking…
            </>
          ) : service === 'result' ? (
            'Check result'
          ) : (
            'Verify record'
          )}
        </Button>
      </form>
      {error && (
        <div role="alert" className="mt-6 rounded-xl border border-border p-5 text-destructive">
          {error}
        </div>
      )}
      {response && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 rounded-xl border border-border p-5 sm:p-7"
        >
          <h2 className={`text-lg font-semibold ${positive ? 'text-brand' : 'text-navy-950'}`}>
            {response.status.replaceAll('_', ' ')}
          </h2>
          <p className="mt-2 text-body text-muted-foreground">{response.message}</p>
          {(response.institution ?? response.maskedReference) && (
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              {[
                ['Institution', response.institution],
                ['Document type', response.documentType?.replaceAll('_', ' ')],
                ['Reference', response.maskedReference],
                ['Program', response.program],
                ['Issue date', response.issueDate],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      )}
      {(response?.results?.length ?? 0) > 0 && (
        <div className="mt-8 space-y-6" data-print-area>
          <div className="print:hidden">
            <label htmlFor="examination-selection" className="mb-2 block text-sm font-medium">
              Examination
            </label>
            <select
              id="examination-selection"
              value={exam}
              onChange={(e) => {
                setExam(e.target.value);
              }}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3"
            >
              <option value="">All published examinations</option>
              {Array.from(
                new Map(
                  (response?.results ?? []).map((r) => [r.examinationId, r.examination]),
                ).entries(),
              ).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {results.map((r) => (
            <article key={r.id} className="rounded-xl border border-border p-5">
              <h2 className="text-xl font-semibold">{r.examination}</h2>
              <p className="mt-2 text-sm">
                Period {r.periodNumber} · Attempt {r.attemptNumber} ·{' '}
                {r.outcome ?? 'Status not supplied'} · GPA {r.sgpa ?? 'Not supplied'}
              </p>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Published subject marks and grades</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-3 pr-4">Subject</th>
                      <th className="py-3 pr-4">Marks</th>
                      <th className="py-3 pr-4">Grade</th>
                      <th className="py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.subjects.map((s) => (
                      <tr key={s.programSubjectId} className="border-b border-border">
                        <th scope="row" className="py-3 pr-4 font-medium">
                          {s.code} — {s.name}
                        </th>
                        <td className="py-3 pr-4 tabular-nums">
                          {s.totalMarks ?? 'Not supplied'} / {s.maxMarks ?? 'Not supplied'}
                        </td>
                        <td className="py-3 pr-4">{s.grade ?? 'Not supplied'}</td>
                        <td className="py-3">{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Published {r.publishedAt.slice(0, 10)}. This view is private to your account.
              </p>
            </article>
          ))}
          <Button
            type="button"
            variant="outline"
            className="print:hidden"
            onClick={() => {
              window.print();
            }}
          >
            Print published results
          </Button>
        </div>
      )}
      <p className="mt-8 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Only records approved for verification can appear here. Drafts, samples and unpublished
        records are excluded. A registration check does not activate an account or issue a document.
      </p>
    </section>
  );
}
