'use client';

import { useEffect, useEffectEvent, useId, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import {
  officialVerificationResponseSchema,
  officialVerificationRequestSchema,
  publicCredentialSchema,
  publicResultOptionsSchema,
  publicResultSearchSchema,
  type OfficialVerificationResponse,
  type PublicResultOptions,
  type PublicVerificationService,
} from '@docversity/validation';
import { ApiError, studentRequest } from '@/lib/api';
import { takeHeroSearch } from './search-handoff';
import { SERVICES } from './services';
import { VerificationResult } from './verification-result';
import styles from './verification-panel.module.css';

const CHECK_CODE = 'Please check the entered code and try again.';

function failure(caught: unknown): string {
  const status = caught instanceof ApiError ? caught.status : 0;
  if (status === 429) return 'Too many checks. Wait a minute, then try again.';
  if (status === 400) return CHECK_CODE;
  if (status >= 400 && status < 500) return 'Verification could not be completed.';
  return 'Verification could not be completed. Please try again shortly.';
}

/** Page frame shared by the four services: title, search form and the result below it. */
export function VerificationPageLayout({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h1 id={titleId} className={styles.title}>
        {title}
      </h1>
      {children}
    </section>
  );
}

/** Opens an issued PDF for the holder of its QR credential (token in the body, never the URL). */
async function openDocument(service: 'certificate' | 'admission-letter', token: string) {
  const tab = window.open('', '_blank');
  const response = await fetch('/api/v1/public/verify/document', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
    body: JSON.stringify({ contractVersion: 2, service, token }),
  });
  if (!response.ok) {
    tab?.close();
    throw new ApiError(
      response.status,
      'DOCUMENT_UNAVAILABLE',
      'The document could not be opened.',
    );
  }
  const url = URL.createObjectURL(await response.blob());
  if (tab) tab.location.href = url;
  else window.location.assign(url);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** The API's approved policy checks decide what (if anything) a visitor sees. No sign-in needed. */
export function VerificationPanel({ service }: { service: PublicVerificationService }) {
  const id = useId();
  const { title } = SERVICES[service];
  const [token, setToken] = useState('');
  const [response, setResponse] = useState<OfficialVerificationResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    const consumeToken = () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (!hash.has('token')) return;
      const value = hash.get('token') ?? '';
      requestVersion.current += 1;
      // QR credentials must leave browser history before any request can be submitted.
      window.history.replaceState(null, '', window.location.pathname);
      queueMicrotask(() => {
        const valid =
          service !== 'registration' &&
          publicCredentialSchema.safeParse({ contractVersion: 2, token: value }).success;
        setToken(valid ? value : '');
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
  }, [service]);

  /** Runs one request; stale answers (the user typed again) are dropped. */
  async function run(request: () => Promise<OfficialVerificationResponse>) {
    if (busy) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    setResponse(null);
    try {
      const result = await request();
      if (version === requestVersion.current) setResponse(result);
    } catch (caught) {
      if (version === requestVersion.current) setError(failure(caught));
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  const reset = () => {
    requestVersion.current += 1;
    setToken('');
    setResponse(null);
    setError('');
  };

  const status = (
    <div id={`${id}-result`} role="status" aria-live="polite" aria-atomic="true">
      {error ? (
        <div role="alert" className={`${styles.result} ${styles.error}`}>
          {error}
        </div>
      ) : busy ? (
        <div className={styles.result}>
          <h2 className={styles.resultTitle}>Checking…</h2>
          <p>Please wait while verification completes.</p>
        </div>
      ) : response ? (
        <>
          <VerificationResult
            service={service}
            response={response}
            token={token}
            viewing={viewing}
            onView={() => {
              if (service !== 'certificate' && service !== 'admission-letter') return;
              setViewing(true);
              openDocument(service, token)
                .catch((caught: unknown) => {
                  setError(failure(caught));
                })
                .finally(() => {
                  setViewing(false);
                });
            }}
          />
          {response.status === 'AUTHENTICATION_REQUIRED' && (
            <Link
              href="/student/login"
              className="mt-3 inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4"
            >
              Student Sign in
            </Link>
          )}
        </>
      ) : (
        <div className={styles.result}>
          <h2 className={styles.resultTitle}>
            {token ? 'Secure QR code ready' : 'No record checked yet'}
          </h2>
          <p>Only university-approved records can be verified. No sign-in is needed.</p>
        </div>
      )}
    </div>
  );

  return (
    <VerificationPageLayout title={title} titleId={`${id}-title`}>
      {service === 'result' ? (
        <ResultSearchForm
          id={id}
          busy={busy}
          token={token}
          onChange={reset}
          onSearch={(body) =>
            run(() =>
              studentRequest(
                'POST',
                'public/verify/result-search',
                officialVerificationResponseSchema,
                {
                  body,
                },
              ),
            )
          }
          onMarksheet={() =>
            run(() =>
              studentRequest(
                'POST',
                'public/verify/result-marksheet',
                officialVerificationResponseSchema,
                {
                  body: { contractVersion: 2, token },
                },
              ),
            )
          }
          onOwn={(reference) =>
            run(() =>
              studentRequest('POST', 'public/verify/result', officialVerificationResponseSchema, {
                body: { contractVersion: 2, reference },
              }),
            )
          }
        />
      ) : (
        <VerificationSearchForm
          id={id}
          service={service}
          busy={busy}
          token={token}
          onChange={reset}
          onInvalid={() => {
            reset();
            setError(CHECK_CODE);
          }}
          onSubmit={(input) =>
            run(() =>
              studentRequest(
                'POST',
                `public/verify/${service}`,
                officialVerificationResponseSchema,
                {
                  body: input,
                },
              ),
            )
          }
        />
      )}
      {status}
    </VerificationPageLayout>
  );
}

/** Number (or held QR credential) lookup for registration, admission letter and certificate. */
export function VerificationSearchForm({
  id,
  service,
  busy,
  token,
  onChange,
  onInvalid,
  onSubmit,
}: {
  id: string;
  service: Exclude<PublicVerificationService, 'result'>;
  busy: boolean;
  token: string;
  onChange: () => void;
  onInvalid: () => void;
  onSubmit: (input: { contractVersion: 2; reference?: string; token?: string }) => Promise<void>;
}) {
  const { label, placeholder, action } = SERVICES[service];
  const [reference, setReference] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (typed?: string) => {
    const input = officialVerificationRequestSchema.safeParse({
      contractVersion: 2,
      ...(typed !== undefined ? { reference: typed } : token ? { token } : { reference }),
    });
    setInvalid(!input.success);
    if (!input.success) onInvalid();
    else void onSubmit(input.data);
  };

  const searchFromHome = useEffectEvent((value: string) => {
    setReference(value);
    // Too short or long to be valid: prefill only, so the user sees what they typed.
    const trimmed = value.trim();
    if (trimmed.length >= 3 && trimmed.length <= 128) submit(value);
  });
  useEffect(() => {
    let live = true;
    // Taken inside the microtask: a development remount or a fast navigation away cancels this
    // run before it consumes the handoff, so exactly one mounted panel performs the lookup.
    queueMicrotask(() => {
      if (!live) return;
      const value = takeHeroSearch(service);
      if (value !== null) searchFromHome(value);
    });
    return () => {
      live = false;
    };
  }, [service]);

  return (
    <form
      className={styles.box}
      aria-busy={busy}
      onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!busy && event.currentTarget.reportValidity()) submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        className={styles.input}
        placeholder={token ? 'Secure QR code loaded' : placeholder}
        value={token ? '' : reference}
        onChange={(event) => {
          setReference(event.target.value);
          setInvalid(false);
          onChange();
        }}
        required={!token}
        disabled={busy}
        minLength={3}
        maxLength={128}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
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
            {action}
            <ArrowRightIcon aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}

/** Check Result: course + roll number + semester/year (status only); QR opens the marksheet. */
function ResultSearchForm({
  id,
  busy,
  token,
  onChange,
  onSearch,
  onMarksheet,
  onOwn,
}: {
  id: string;
  busy: boolean;
  token: string;
  onChange: () => void;
  onSearch: (body: unknown) => Promise<void>;
  onMarksheet: () => Promise<void>;
  onOwn: (reference: string) => Promise<void>;
}) {
  const [options, setOptions] = useState<PublicResultOptions['programs'] | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [programId, setProgramId] = useState('');
  const [period, setPeriod] = useState('');
  const [roll, setRoll] = useState('');
  const [own, setOwn] = useState('');
  useEffect(() => {
    let live = true;
    studentRequest('POST', 'public/verify/result-options', publicResultOptionsSchema, {
      body: { contractVersion: 2 },
    })
      .then((value) => {
        if (live) setOptions(value.programs);
      })
      .catch(() => {
        if (live) setOptionsError(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const program = options?.find((p) => p.id === programId);
  const field = 'min-h-11 w-full rounded-md border border-input bg-background px-3 text-base';

  if (token)
    return (
      <div className={styles.result}>
        <h2 className={styles.resultTitle}>Secure marksheet QR code ready</h2>
        <Button type="button" className="mt-3" disabled={busy} onClick={() => void onMarksheet()}>
          View marksheet
        </Button>
      </div>
    );

  return (
    <>
      <form
        className="grid gap-4 rounded-[20px] border border-border bg-card p-5 sm:grid-cols-3"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          const body = publicResultSearchSchema.safeParse({
            contractVersion: 2,
            programId,
            rollNumber: roll,
            periodNumber: Number(period),
          });
          if (body.success) void onSearch(body.data);
        }}
      >
        <div className="sm:col-span-3">
          <label htmlFor={`${id}-course`} className="mb-2 block text-sm font-medium">
            Course Name
          </label>
          <select
            id={`${id}-course`}
            className={field}
            value={programId}
            required
            disabled={busy || !options?.length}
            onChange={(event) => {
              setProgramId(event.target.value);
              setPeriod('');
              onChange();
            }}
          >
            <option value="">
              {options === null
                ? optionsError
                  ? 'Courses could not be loaded'
                  : 'Loading courses…'
                : options.length
                  ? 'Select course'
                  : 'No course offers online result checks yet'}
            </option>
            {options?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-roll`} className="mb-2 block text-sm font-medium">
            Roll Number
          </label>
          <Input
            id={`${id}-roll`}
            className="min-h-11"
            value={roll}
            required
            maxLength={64}
            pattern="[A-Za-z0-9][A-Za-z0-9._/\-]*"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => {
              setRoll(event.target.value);
              onChange();
            }}
          />
        </div>
        <div>
          <label htmlFor={`${id}-period`} className="mb-2 block text-sm font-medium">
            {program?.structure === 'YEAR' ? 'Year' : 'Semester'}
          </label>
          <select
            id={`${id}-period`}
            className={field}
            value={period}
            required
            disabled={busy || !program}
            onChange={(event) => {
              setPeriod(event.target.value);
              onChange();
            }}
          >
            <option value="">{program ? 'Select' : 'Select a course first'}</option>
            {program?.periods.map((n) => (
              <option key={n} value={n}>
                {program.structure === 'YEAR' ? `Year ${String(n)}` : `Semester ${String(n)}`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            className={`${styles.verify} w-full`}
            disabled={busy || !options?.length}
          >
            {busy ? 'Checking…' : 'Check Result'}
          </Button>
        </div>
      </form>
      <details className="mt-4 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand">
          Student? See your own published marks after signing in
        </summary>
        <form
          className="mt-3 flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (own.trim()) void onOwn(own.trim());
          }}
        >
          <label htmlFor={`${id}-own`} className="sr-only">
            Your registration number
          </label>
          <Input
            id={`${id}-own`}
            className="min-h-11 flex-1"
            placeholder="Your registration number"
            value={own}
            maxLength={128}
            autoComplete="off"
            onChange={(event) => {
              setOwn(event.target.value);
              onChange();
            }}
          />
          <Button type="submit" variant="outline" className="min-h-11" disabled={busy}>
            Show my results
          </Button>
        </form>
      </details>
    </>
  );
}
