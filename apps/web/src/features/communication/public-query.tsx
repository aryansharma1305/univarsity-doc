'use client';

import { useId, useState } from 'react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  MESSAGE_RULES,
  VERIFICATION_QUERY_CATEGORIES,
  type PublicVerificationQueryReceipt,
  type RequesterVerificationQuery,
  type VerificationQueryCategory,
} from '@docversity/validation';
import { ApiError } from '@/lib/api';
import { publicQueriesApi } from './api';
import { QUERY_STATUS, VERIFICATION_QUERY_CATEGORY_LABELS } from './shared';

const failure = (error: unknown) =>
  error instanceof ApiError && error.status === 429
    ? 'Too many requests. Please wait and try again later.'
    : error instanceof ApiError && error.status === 404
      ? 'No query matches this reference and access code.'
      : error instanceof ApiError && error.status === 400
        ? 'Please check the details and try again.'
        : 'Something went wrong. Please try again shortly.';

/** A form field as text (files are never expected here). */
const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

const field = 'min-h-11 w-full rounded-md border border-input bg-background px-3';

/** Public verification support: no account needed; records are never looked up or disclosed. */
export function PublicVerificationQuery() {
  const id = useId();
  const [receipt, setReceipt] = useState<PublicVerificationQueryReceipt | null>(null);
  const [answer, setAnswer] = useState<RequesterVerificationQuery | null>(null);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<VerificationQueryCategory>('HOW_TO_VERIFY');

  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-12">
      <h1 className="text-page-title">Verification support</h1>
      <p className="mt-3 text-muted-foreground">
        Ask the university about verifying a registration, admission letter, certificate or result.
        Staff answer here; we never send records by email, and an answer never includes another
        person’s private information.
      </p>

      {receipt ? (
        <div role="status" className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-navy-950">Query submitted</h2>
          <p className="mt-2 text-sm">
            Keep both values. The access code is shown only once and is needed to read the answer.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Reference</dt>
              <dd className="font-mono text-lg font-semibold">{receipt.reference}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Access code</dt>
              <dd className="font-mono text-lg font-semibold break-all">{receipt.accessCode}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <form
          className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            publicQueriesApi
              .submit({
                requesterName: text(data, 'requesterName'),
                organization: text(data, 'organization') || null,
                contactEmail: text(data, 'contactEmail') || null,
                category,
                documentReference: text(data, 'documentReference') || null,
                message: text(data, 'message'),
              })
              .then(setReceipt)
              .catch((caught: unknown) => {
                setError(failure(caught));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <h2 className="text-lg font-semibold text-navy-950 sm:col-span-2">Ask a question</h2>
          <div>
            <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-medium">
              Your name
            </label>
            <Input id={`${id}-name`} name="requesterName" required maxLength={200} />
          </div>
          <div>
            <label htmlFor={`${id}-org`} className="mb-1 block text-sm font-medium">
              Organization (optional)
            </label>
            <Input id={`${id}-org`} name="organization" maxLength={200} />
          </div>
          <div>
            <label htmlFor={`${id}-email`} className="mb-1 block text-sm font-medium">
              Contact email (optional)
            </label>
            <Input id={`${id}-email`} name="contactEmail" type="email" maxLength={254} />
          </div>
          <div>
            <label htmlFor={`${id}-category`} className="mb-1 block text-sm font-medium">
              Topic
            </label>
            <select
              id={`${id}-category`}
              className={field}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as VerificationQueryCategory);
              }}
            >
              {VERIFICATION_QUERY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {VERIFICATION_QUERY_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-doc`} className="mb-1 block text-sm font-medium">
              Document number you were checking (optional)
            </label>
            <Input id={`${id}-doc`} name="documentReference" maxLength={100} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-message`} className="mb-1 block text-sm font-medium">
              Your question
            </label>
            <Textarea
              id={`${id}-message`}
              name="message"
              rows={5}
              required
              maxLength={MESSAGE_RULES.bodyMax}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-text sm:col-span-2">
              {error}
            </p>
          )}
          <Button type="submit" className="w-fit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit query'}
          </Button>
        </form>
      )}

      <form
        className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setStatusError('');
          setAnswer(null);
          publicQueriesApi
            .status({
              reference: text(data, 'reference'),
              accessCode: text(data, 'accessCode'),
            })
            .then(setAnswer)
            .catch((caught: unknown) => {
              setStatusError(failure(caught));
            });
        }}
      >
        <h2 className="text-lg font-semibold text-navy-950 sm:col-span-3">Check an answer</h2>
        <div>
          <label htmlFor={`${id}-ref`} className="mb-1 block text-sm font-medium">
            Reference
          </label>
          <Input id={`${id}-ref`} name="reference" required maxLength={11} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`${id}-code`} className="mb-1 block text-sm font-medium">
            Access code
          </label>
          <Input id={`${id}-code`} name="accessCode" required maxLength={64} autoComplete="off" />
        </div>
        <Button type="submit" variant="outline">
          Check
        </Button>
        {statusError && (
          <p role="alert" className="text-sm text-danger-text sm:col-span-3">
            {statusError}
          </p>
        )}
        {answer && (
          <div role="status" className="rounded-lg bg-info-soft p-4 text-sm sm:col-span-3">
            <p className="font-semibold text-navy-950">
              {answer.reference} · {QUERY_STATUS[answer.status].label}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words">
              {answer.response ?? 'The university has not answered yet. Please check again later.'}
            </p>
          </div>
        )}
      </form>
    </section>
  );
}
