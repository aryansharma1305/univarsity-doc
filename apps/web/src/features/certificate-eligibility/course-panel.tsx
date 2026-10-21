'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheckIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Textarea } from '@docversity/ui/components/textarea';
import { Skeleton } from '@docversity/ui/components/skeleton';
import type {
  CertificateEligibilityConfig,
  CertificateType,
  ProgramCertificateEligibility,
} from '@docversity/validation';
import { ErrorState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  certificateEligibilityApi as api,
  programEligibilityKey,
  useProgramCertificateEligibility,
} from './api';
import {
  CERTIFICATE_TITLES,
  CONFIG_STATUS,
  COURSE_CONFIGURATION,
  TYPE_ELIGIBILITY,
  UNRESOLVED_REASON,
  monthsLabel,
} from './labels';

function ConfigSummary({ config, title }: { config: CertificateEligibilityConfig; title: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-navy-950">{title}</h3>
        <StatusBadge tone={CONFIG_STATUS[config.status].tone}>
          {CONFIG_STATUS[config.status].label} · revision {config.revision}
        </StatusBadge>
      </div>
      <p className="mt-2 text-sm">
        {config.certificateTypes.map((t) => CERTIFICATE_TITLES[t]).join(' · ')}
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-meta">University authority</dt>
          <dd className="break-words">{config.authorityReference}</dd>
        </div>
        <div>
          <dt className="text-meta">Proposed by</dt>
          <dd>
            {config.proposedBy.displayName} · {formatDateTime(config.proposedAt)}
          </dd>
        </div>
        {config.decidedBy && config.decidedAt && (
          <div>
            <dt className="text-meta">Decided by</dt>
            <dd>
              {config.decidedBy.displayName} · {formatDateTime(config.decidedAt)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-meta">Policy basis</dt>
          <dd>
            Duration policy v{config.policyVersion} · {monthsLabel(config.durationMonths)}
          </dd>
        </div>
      </dl>
      {config.rationale && (
        <p className="mt-3 text-sm whitespace-pre-wrap break-words text-muted-foreground">
          {config.rationale}
        </p>
      )}
      {!config.matchesCurrentCourse && (
        <p className="mt-3 text-sm text-danger-text" role="note">
          The course duration or policy version has changed since this was proposed, so it no longer
          applies.
        </p>
      )}
    </div>
  );
}

function ProposeForm({
  data,
  durationKey,
  onDone,
}: {
  data: ProgramCertificateEligibility;
  durationKey: string;
  onDone: () => void;
}) {
  const permitted = data.evaluation.permittedTypes;
  const [types, setTypes] = useState<CertificateType[]>([]);
  const [authority, setAuthority] = useState('');
  const [rationale, setRationale] = useState('');
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  async function submit() {
    setPending(true);
    setError(null);
    try {
      const next = await api.propose(data.program.id, {
        certificateTypes: types,
        authorityReference: authority,
        ...(rationale.trim() ? { rationale } : {}),
      });
      client.setQueryData(programEligibilityKey(data.program.id, durationKey), next);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setReview(false);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="mt-4 space-y-4 rounded-lg border bg-background p-4"
      aria-labelledby="propose-heading"
      onSubmit={(e) => {
        e.preventDefault();
        if (review) void submit();
        else setReview(true);
      }}
    >
      <h3 id="propose-heading" className="font-semibold text-navy-950">
        Propose a certificate set
      </h3>
      <fieldset disabled={review || pending}>
        <legend className="text-sm font-medium">
          Certificate types permitted for {monthsLabel(data.evaluation.durationMonths)}
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {permitted.map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-3 rounded-md border px-3">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-brand)]"
                checked={types.includes(t)}
                onChange={(e) => {
                  setTypes((v) => (e.target.checked ? [...v, t] : v.filter((x) => x !== t)));
                }}
              />
              <span className="text-sm">{CERTIFICATE_TITLES[t]}</span>
            </label>
          ))}
        </div>
        <label htmlFor="eligibility-authority" className="mt-4 block text-sm font-medium">
          University authority reference (required)
        </label>
        <Input
          id="eligibility-authority"
          required
          maxLength={200}
          value={authority}
          placeholder="e.g. Academic Council resolution number"
          onChange={(e) => {
            setAuthority(e.target.value);
          }}
        />
        <label htmlFor="eligibility-rationale" className="mt-4 block text-sm font-medium">
          Notes for the approver (optional)
        </label>
        <Textarea
          id="eligibility-rationale"
          maxLength={1000}
          value={rationale}
          onChange={(e) => {
            setRationale(e.target.value);
          }}
        />
      </fieldset>
      {review && (
        <p className="text-sm" role="status">
          You are proposing {types.map((t) => CERTIFICATE_TITLES[t]).join(', ')}. A different,
          authorized person must approve it before students see these types as offered.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || types.length === 0 || !authority.trim()}>
          {review ? (pending ? 'Submitting…' : 'Submit proposal') : 'Review proposal'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (review) setReview(false);
            else onDone();
          }}
        >
          {review ? 'Edit proposal' : 'Cancel'}
        </Button>
      </div>
    </form>
  );
}

export function CourseCertificateEligibilityPanel({
  programId,
  durationKey,
}: {
  programId: string;
  /** Changes when the course duration is edited, so the server re-evaluates the policy. */
  durationKey: string;
}) {
  const canRead = useCan(PERMISSIONS.certificateEligibilityRead);
  const query = useProgramCertificateEligibility(programId, durationKey, canRead);
  const [proposing, setProposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  if (!canRead) return null;

  async function decide(config: CertificateEligibilityConfig, action: 'withdraw' | 'approve') {
    setBusy(true);
    setError(null);
    try {
      const next = await api.decide(config.id, action, { version: config.version });
      client.setQueryData(programEligibilityKey(programId, durationKey), next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="eligibility-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="eligibility-heading" className="text-section-title text-navy-950">
          Certificate eligibility
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Which certificate types this course may offer under the university&apos;s course-duration
          policy. This is course configuration only.
        </p>
      </div>
      {query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="rounded-lg border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-meta">
                Duration policy v{query.data.policy.version} ·{' '}
                {monthsLabel(query.data.evaluation.durationMonths)}
              </p>
              <p className="mt-1 font-medium text-navy-950">
                {query.data.evaluation.outcome === 'TIER'
                  ? query.data.policy.tiers.find((t) => t.tier === query.data.evaluation.tier)
                      ?.label
                  : 'Not covered by the university policy'}
              </p>
            </div>
            <StatusBadge tone={COURSE_CONFIGURATION[query.data.configuration].tone}>
              {COURSE_CONFIGURATION[query.data.configuration].label}
            </StatusBadge>
          </div>
          {query.data.evaluation.unresolvedReason && (
            <p className="mt-3 rounded-md bg-info-soft p-3 text-sm text-navy-900" role="note">
              {UNRESOLVED_REASON[query.data.evaluation.unresolvedReason]} No certificate type can be
              proposed until the university decides.
            </p>
          )}
          <ul className="mt-4 divide-y rounded-lg border" aria-label="Certificate types">
            {query.data.types.map((t) => (
              <li
                key={t.certificateType}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="text-sm font-medium">{CERTIFICATE_TITLES[t.certificateType]}</span>
                <StatusBadge tone={TYPE_ELIGIBILITY[t.eligibility].tone}>
                  {TYPE_ELIGIBILITY[t.eligibility].label}
                </StatusBadge>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {query.data.approved && (
              <ConfigSummary config={query.data.approved} title="Approved set" />
            )}
            {query.data.pending && (
              <div>
                <ConfigSummary config={query.data.pending} title="Proposal awaiting decision" />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {query.data.canWithdraw && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (query.data.pending) void decide(query.data.pending, 'withdraw');
                      }}
                    >
                      Withdraw proposal
                    </Button>
                  )}
                  <Button
                    disabled={!query.data.canDecide || busy}
                    aria-describedby="approval-state"
                    onClick={() => {
                      if (query.data.pending) void decide(query.data.pending, 'approve');
                    }}
                  >
                    <ShieldCheckIcon aria-hidden="true" />
                    Approve set
                  </Button>
                </div>
                <p id="approval-state" className="mt-2 text-xs text-muted-foreground">
                  {query.data.approval.reason}
                </p>
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger-text">
              {error}
            </p>
          )}
          {query.data.canPropose &&
            (proposing ? (
              <ProposeForm
                data={query.data}
                durationKey={durationKey}
                onDone={() => {
                  setProposing(false);
                }}
              />
            ) : (
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => {
                  setProposing(true);
                }}
              >
                Propose certificate set
              </Button>
            ))}
          <ul className="mt-5 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {query.data.boundaries.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {query.data.history.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">
                History ({query.data.history.length})
              </summary>
              <ol className="mt-2 space-y-2">
                {query.data.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge tone={CONFIG_STATUS[h.status].tone}>
                      {CONFIG_STATUS[h.status].label}
                    </StatusBadge>
                    <span>
                      Revision {h.revision} ·{' '}
                      {h.certificateTypes.map((t) => CERTIFICATE_TITLES[t]).join(', ')} ·{' '}
                      {formatDateTime(h.proposedAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
