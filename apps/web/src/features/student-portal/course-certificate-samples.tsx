'use client';

import { useId, useState } from 'react';
import { DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  ACADEMIC_SAMPLE_IDS,
  academicSampleFileUrl,
  type StudentRegistrationEligibilityV1,
  type UnresolvedDurationReason,
} from '@docversity/validation';

const TITLES = {
  COURSE_COMPLETION: 'Course Completion Certificate',
  TRANSCRIPT: 'Transcript',
  PROVISIONAL: 'Provisional Certificate',
  CHARACTER: 'Character Certificate',
  MIGRATION: 'Migration Certificate',
} as const;

const UNRESOLVED: Record<UnresolvedDurationReason, string> = {
  MISSING_DURATION: 'This course has no recorded duration yet.',
  BELOW_TWO_MONTHS:
    'The university has not yet decided which certificates courses under 2 months offer.',
  FOUR_TO_FIVE_MONTHS:
    'The university has not yet decided which certificates 4- and 5-month courses offer.',
  SEVEN_TO_ELEVEN_MONTHS:
    'The university has not yet decided which certificates 7- to 11-month courses offer.',
  EXACTLY_TWELVE_MONTHS:
    'The university has not yet decided which certificates 1-year courses offer.',
};

function duration(months: number | null) {
  if (months === null) return 'Duration not recorded';
  if (months % 12 === 0) return `${months / 12} ${months === 12 ? 'year' : 'years'}`;
  return `${months} months`;
}

function CourseSamples({ registration }: { registration: StudentRegistrationEligibilityV1 }) {
  const offered = registration.certificates.filter(
    (c) => c.typeEligibility !== 'NOT_OFFERED_FOR_COURSE',
  );
  const notOffered = registration.certificates.filter(
    (c) => c.typeEligibility === 'NOT_OFFERED_FOR_COURSE',
  );
  const unresolved = registration.duration.unresolvedReason;
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm font-medium text-navy-950">
        {registration.program.name}
        <span className="font-normal text-muted-foreground">
          {' '}
          · {duration(registration.program.durationMonths)}
        </span>
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {unresolved
          ? 'Certificate availability for this course has not been confirmed yet.'
          : 'Certificate types for this course and whether a sample is available.'}{' '}
        A sample shows the layout only: it does not mean you have completed the course, qualified,
        paid, or received Rector approval or an issued certificate.
      </p>
      {unresolved ? (
        <p className="rounded-md bg-info-soft p-3 text-sm text-navy-900" role="note">
          {UNRESOLVED[unresolved]} No academic samples are available for it yet.
        </p>
      ) : (
        <ul
          className="divide-y rounded-lg border"
          aria-label={`Certificates for ${registration.program.name}`}
        >
          {offered.map((c) => {
            const title = TITLES[c.certificateType];
            const sampleId = ACADEMIC_SAMPLE_IDS[c.certificateType];
            return (
              <li
                key={c.certificateType}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-navy-950">{title}</span>
                {c.samplePreviewAllowed ? (
                  <span className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className="min-h-11">
                      <a
                        href={academicSampleFileUrl(
                          registration.registrationId,
                          sampleId,
                          'inline',
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Preview ${title} sample (opens in a new tab)`}
                      >
                        <ExternalLinkIcon aria-hidden="true" />
                        Preview
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <a
                        href={academicSampleFileUrl(
                          registration.registrationId,
                          sampleId,
                          'attachment',
                        )}
                        aria-label={`Download ${title} sample PDF`}
                      >
                        <DownloadIcon aria-hidden="true" />
                        Download
                      </a>
                    </Button>
                  </span>
                ) : (
                  <StatusBadge tone="neutral">Not currently approved for this course</StatusBadge>
                )}
              </li>
            );
          })}
          {offered.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No academic certificate types are offered for this course.
            </li>
          )}
        </ul>
      )}
      {!unresolved && offered.some((c) => !c.samplePreviewAllowed) && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Samples are shown only for certificate types currently approved for this course.
        </p>
      )}
      {!unresolved && notOffered.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Not offered for this course: {notOffered.map((c) => TITLES[c.certificateType]).join(', ')}
          .
        </p>
      )}
    </div>
  );
}

/**
 * Phase 12C.1: academic samples per registration. Display only; the API re-checks ownership and the
 * course's approved certificate types on every file request. With several registrations nothing is
 * preselected: the student chooses the course.
 */
export function CourseCertificateSamples({
  registrations,
}: {
  registrations: StudentRegistrationEligibilityV1[] | null;
}) {
  const selectId = useId();
  const [selected, setSelected] = useState('');
  if (registrations === null)
    return (
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        Course samples could not be loaded right now. Refresh the page to try again.
      </p>
    );
  if (registrations.length === 0)
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No course registrations were found for your account.
      </p>
    );
  const [only] = registrations;
  if (registrations.length === 1 && only) return <CourseSamples registration={only} />;
  const chosen = registrations.find((r) => r.registrationId === selected);
  return (
    <div className="mt-3">
      <label htmlFor={selectId} className="mb-2 block text-sm font-medium text-navy-950">
        Choose a course
      </label>
      <select
        id={selectId}
        className="h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:max-w-md"
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value);
        }}
      >
        <option value="">Select one of your courses…</option>
        {registrations.map((r) => (
          <option key={r.registrationId} value={r.registrationId}>
            {r.program.name} ({r.registrationNumber})
          </option>
        ))}
      </select>
      {chosen ? (
        <CourseSamples registration={chosen} />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          You have {registrations.length} courses. Choose one to see its certificate samples.
        </p>
      )}
    </div>
  );
}
