'use client';

import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@docversity/ui';
import type { StudentCertificateEligibilityItemV1 } from '@docversity/validation';
import { ErrorState, TableSkeleton } from '@/components/data/states';
import { certificateEligibilityApi as api } from './api';
import {
  CERTIFICATE_TITLES,
  COURSE_CONFIGURATION,
  TYPE_ELIGIBILITY,
  UNRESOLVED_REASON,
  monthsLabel,
} from './labels';

const STAGES = [
  ['applicationAvailability', 'Application'],
  ['courseCompletionStatus', 'Course completion'],
  ['paymentVerification', 'Payment verification'],
  ['rectorApproval', 'Rector approval'],
  ['issuance', 'Issuance'],
] as const;
const STAGE_TEXT: Record<string, string> = {
  AVAILABLE: 'Available',
  NOT_AVAILABLE: 'Not available yet',
  NOT_EVALUATED: 'Not evaluated',
};

function Stages({ item }: { item: StudentCertificateEligibilityItemV1 }) {
  // Today every later stage is unavailable for every type; one sentence says so without repeating a
  // five-cell grid per certificate. If a stage ever differs, the full list is shown instead.
  if (item.applicationAvailability === 'NOT_AVAILABLE')
    return (
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Application, payment verification, Rector approval and issuance are not available yet.
        Course completion is not evaluated.
      </p>
    );
  return (
    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
      {STAGES.map(([key, label]) => (
        <div key={key} className="flex justify-between gap-3 sm:justify-start">
          <dt>{label}</dt>
          <dd className="text-right text-foreground/80 sm:text-left">
            {STAGE_TEXT[item[key]] ?? item[key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Read-only certificate eligibility per registration (Phase 12C). Labels only: nothing here submits,
 * requests, approves or issues anything, and Phase 12B application safeguards are unchanged.
 */
export function StudentCertificateEligibility() {
  const query = useQuery({
    queryKey: ['certificate-eligibility', 'student'],
    queryFn: api.student,
  });
  return (
    <section aria-labelledby="eligibility-heading">
      <h2 id="eligibility-heading" className="text-lg font-semibold">
        Certificates for your courses
      </h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-muted-foreground">
        Which certificate types the university offers for each of your courses. This does not mean
        you have qualified, and it does not start an application.
      </p>
      {query.isPending ? (
        <TableSkeleton rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.registrations.length === 0 ? (
        <p className="rounded-xl border bg-card p-5 text-sm">No course registrations found.</p>
      ) : (
        <div className="grid gap-4">
          {query.data.registrations.map((r) => (
            <article
              key={r.registrationId}
              className="rounded-xl border bg-card p-5 sm:p-6"
              aria-labelledby={`eligibility-${r.registrationId}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id={`eligibility-${r.registrationId}`} className="font-semibold break-words">
                    {r.program.name}
                  </h3>
                  <p className="mt-1 text-sm break-all text-muted-foreground">
                    {r.registrationNumber} · {monthsLabel(r.program.durationMonths)}
                  </p>
                </div>
                <StatusBadge tone={COURSE_CONFIGURATION[r.courseConfiguration].tone}>
                  {COURSE_CONFIGURATION[r.courseConfiguration].label}
                </StatusBadge>
              </div>
              {r.duration.unresolvedReason && (
                <p className="mt-3 rounded-md bg-info-soft p-3 text-sm text-navy-900" role="note">
                  {UNRESOLVED_REASON[r.duration.unresolvedReason]} Certificate types will appear
                  once the university decides.
                </p>
              )}
              <ul className="mt-4 divide-y rounded-lg border">
                {r.certificates.map((c) => (
                  <li key={c.certificateType} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {CERTIFICATE_TITLES[c.certificateType]}
                      </span>
                      <StatusBadge tone={TYPE_ELIGIBILITY[c.typeEligibility].tone}>
                        {TYPE_ELIGIBILITY[c.typeEligibility].label}
                      </StatusBadge>
                    </div>
                    {c.typeEligibility !== 'NOT_OFFERED_FOR_COURSE' &&
                      c.typeEligibility !== 'POLICY_UNRESOLVED' && <Stages item={c} />}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
