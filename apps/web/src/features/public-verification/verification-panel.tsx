'use client';

import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import {
  officialVerificationResponseSchema,
  type OfficialVerificationResponse,
  type PublicVerificationService,
} from '@docversity/validation';
import { ApiError, studentRequest } from '@/lib/api';
import styles from './verification-panel.module.css';

const SERVICES = {
  'admission-letter': {
    title: 'Verify Admission Letter',
    label: 'Admission letter number',
    placeholder: 'Enter admission letter number',
  },
  certificate: {
    title: 'Verify Certificate',
    label: 'Certificate number',
    placeholder: 'Enter the code printed on the certificate',
  },
  registration: {
    title: 'Verify Registration',
    label: 'Registration number',
    placeholder: 'Enter registration number',
  },
  result: {
    title: 'Check Result',
    label: 'Registration number',
    placeholder: 'Enter result code or registration number',
  },
} satisfies Record<
  PublicVerificationService,
  { title: string; label: string; placeholder: string }
>;

/** The API's approved policy and ownership checks decide whether a lookup is available. */
export function VerificationPanel({ service }: { service: PublicVerificationService }) {
  const id = useId();
  const { title, label, placeholder } = SERVICES[service];
  const [reference, setReference] = useState('');
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState('');
  const [exam, setExam] = useState('');
  const [response, setResponse] = useState<OfficialVerificationResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);
  const privateLookup = service === 'registration' || service === 'result';

  useEffect(() => {
    const consumeToken = () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (!hash.has('token')) return;
      const value = hash.get('token') ?? '';
      requestVersion.current += 1;
      // QR credentials must leave browser history before any request can be submitted.
      window.history.replaceState(null, '', window.location.pathname);
      queueMicrotask(() => {
        const valid = !privateLookup && /^[A-Za-z0-9_-]{43}$/.test(value);
        setToken(valid ? value : '');
        setReference('');
        setResponse(null);
        setBusy(false);
        setError(
          valid ? '' : 'This QR code cannot be checked here. Enter the printed number instead.',
        );
      });
    };
    consumeToken();
    window.addEventListener('hashchange', consumeToken);
    return () => {
      window.removeEventListener('hashchange', consumeToken);
      requestVersion.current += 1;
    };
  }, [privateLookup]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setPeriod('');
    await lookup();
  }

  async function lookup(periodNumber?: number) {
    if (busy) return;
    const version = ++requestVersion.current;
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
            ...(service === 'result' && periodNumber ? { periodNumber } : {}),
          },
        },
      );
      if (version === requestVersion.current) setResponse(result);
    } catch (caught) {
      if (version === requestVersion.current)
        setError(
          caught instanceof ApiError && caught.status === 429
            ? 'Too many checks. Wait a minute, then try again.'
            : 'Verification could not be completed. Please try again shortly.',
        );
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  const results = (response?.results ?? []).filter(
    (result) =>
      (!exam || result.examinationId === exam) &&
      (!period || result.periodNumber === Number(period)),
  );
  const noMatch = response?.status === 'NOT_FOUND' || response?.status === 'INVALID';

  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} className={styles.title}>
        {title}
      </h1>
      <form
        className={styles.box}
        aria-busy={busy}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <Input
          id={id}
          className={styles.input}
          placeholder={placeholder}
          value={token || reference}
          onChange={(event) => {
            requestVersion.current += 1;
            setReference(event.target.value);
            setToken('');
            setResponse(null);
            setError('');
          }}
          required
          disabled={busy}
          minLength={3}
          maxLength={128}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-result`}
        />
        <Button type="submit" className={styles.verify} disabled={busy}>
          {busy ? (
            <>
              <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
              Checking…
            </>
          ) : (
            <>
              Verify
              <ArrowRightIcon aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
      {error ? (
        <div id={`${id}-result`} role="alert" className={`${styles.result} ${styles.error}`}>
          {error}
        </div>
      ) : (
        <div
          id={`${id}-result`}
          className={styles.result}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <h2 className={styles.resultTitle}>
            {busy
              ? 'Checking…'
              : response
                ? response.status.replaceAll('_', ' ')
                : token
                  ? 'Secure QR code ready'
                  : 'No record checked yet'}
          </h2>
          <p>
            {busy
              ? 'Please wait while verification completes.'
              : response
                ? noMatch
                  ? 'No matching record found. Please check the entered code and try again.'
                  : response.message
                : 'Only university-approved records can be verified.'}
          </p>
          {response?.status === 'AUTHENTICATION_REQUIRED' && (
            <Link
              href="/student/login"
              className="mt-3 inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4"
            >
              Student Sign in
            </Link>
          )}
          {(response?.institution ?? response?.maskedReference) && (
            <dl className={styles.resultFields}>
              {[
                ['Institution', response.institution],
                ['Document type', response.documentType?.replaceAll('_', ' ')],
                ['Reference', response.maskedReference],
                ['Program', response.program],
                ['Issue date', response.issueDate],
              ]
                .filter(([, value]) => value)
                .map(([field, value]) => (
                  <div key={field}>
                    <dt>{field}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      )}
      {service === 'result' &&
        (response?.status === 'VALID' || response?.status === 'UNPUBLISHED') && (
          <div className="mt-8 space-y-6" data-print-area>
            <div className="print:hidden">
              <label htmlFor="verification-period" className="mb-2 block text-sm font-medium">
                Semester / academic year
              </label>
              <select
                id="verification-period"
                value={period}
                onChange={(event) => {
                  const value = event.target.value;
                  setPeriod(value);
                  void lookup(value ? Number(value) : undefined);
                }}
                className="mb-5 min-h-11 w-full rounded-md border border-input bg-background px-3"
              >
                <option value="">All published periods</option>
                {Array.from({ length: 24 }, (_, index) => (
                  <option key={index} value={index + 1}>
                    Period {index + 1}
                  </option>
                ))}
              </select>
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
                    (response.results ?? []).map((r) => [r.examinationId, r.examination]),
                  ).entries(),
                ).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {results.length === 0 && <p>No published results match these filters.</p>}
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
              disabled={results.length === 0}
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
    </section>
  );
}
