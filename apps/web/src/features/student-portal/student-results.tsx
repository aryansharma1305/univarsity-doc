import Link from 'next/link';
import {
  BookOpenCheckIcon,
  ArrowRightIcon,
  FileTextIcon,
  ShieldCheckIcon,
  CircleAlertIcon,
} from 'lucide-react';
import type { StudentResultsPage } from '@docversity/validation';
import { PageIntro } from './portal-ui';
import { StudentActionMotion } from './student-motion';
import { StudentResultsMotion } from './student-results-motion';
import { StudentResultsRetry } from './student-results-retry';

export function StudentResults({ results }: { results: StudentResultsPage | null }) {
  return (
    <StudentResultsMotion>
      <PageIntro title="My Results" description="Your university results, in one private place." />
      <section
        className="overflow-hidden rounded-2xl border border-border bg-card"
        aria-label="University results"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-7">
          <h2 className="flex items-center gap-2.5 text-card-title text-navy-950">
            <BookOpenCheckIcon className="size-5 text-brand" aria-hidden="true" />
            Examination results
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-4" aria-hidden="true" />
            Private to your account
          </span>
        </div>
        <div className="flex flex-col items-center px-5 py-10 text-center sm:px-7 sm:py-14">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-brand">
            {results ? (
              <BookOpenCheckIcon className="size-7" aria-hidden="true" />
            ) : (
              <CircleAlertIcon className="size-7" aria-hidden="true" />
            )}
          </span>
          {results ? (
            <div role="status">
              <h3 className="font-heading text-xl font-semibold text-navy-950">
                Nothing published yet
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Your results haven&apos;t been published yet. They&apos;ll appear here when your
                university releases them.
              </p>
            </div>
          ) : (
            <div role="alert">
              <h3 className="font-heading text-xl font-semibold text-navy-950">
                Results couldn&apos;t be loaded
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                We couldn&apos;t reach your results. Please try again. Your records haven&apos;t
                changed.
              </p>
              <div className="mt-5">
                <StudentResultsRetry />
              </div>
            </div>
          )}
          <div className="mt-7">
            <StudentActionMotion>
              <Link
                href="/student/examinations"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-navy-950 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                View examinations
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
            </StudentActionMotion>
          </div>
        </div>
        <div className="flex items-start gap-3 border-t border-border px-5 py-5 text-sm sm:px-7">
          <FileTextIcon className="mt-0.5 size-5 shrink-0 text-violet-700" aria-hidden="true" />
          <div>
            <h3 className="font-medium text-navy-950">Official marksheets</h3>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Marksheet downloads aren&apos;t available yet. For certificates already issued to you,
              visit{' '}
              <Link
                href="/student/documents"
                className="rounded font-medium text-brand underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                My Documents
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Need help with a result or its release date? Contact your university&apos;s examination
        office.
      </p>
    </StudentResultsMotion>
  );
}
