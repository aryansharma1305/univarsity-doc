import Link from 'next/link';
import { PaymentButtonPanel } from '@/features/payments/payment-button';
import {
  CalendarDaysIcon,
  ClipboardCheckIcon,
  ClipboardPenLineIcon,
  ExternalLinkIcon,
  MonitorSmartphoneIcon,
} from 'lucide-react';
import { EXAMINATION_KIND_LABELS, type StudentExaminations } from '@docversity/validation';
import { PageIntro, PortalCard, PortalEmptyState } from './portal-ui';

const optionClass =
  'flex min-h-28 flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 text-navy-950 transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function LoadError() {
  return (
    <PortalCard title="Examinations" icon={ClipboardCheckIcon}>
      <p role="alert" className="text-sm text-danger-text">
        Your examination information could not be loaded right now. Refresh the page to try again.
      </p>
    </PortalCard>
  );
}

/** Examinations: exactly three options. The exam panel is the university's external application. */
export function StudentExaminationsPage({ data }: { data: StudentExaminations | null }) {
  // shortcut: links to the first configured examination application; list all if several are used.
  const panel = data?.applications[0];
  return (
    <>
      <PageIntro title="Examinations" />
      {data === null ? (
        <LoadError />
      ) : (
        <ul aria-label="Examination options" className="grid gap-4 sm:grid-cols-3">
          <li>
            <Link href="/student/examinations/apply" className={optionClass}>
              <ClipboardCheckIcon aria-hidden="true" className="size-6 text-brand" />
              <span className="font-semibold">Apply for Exam</span>
            </Link>
          </li>
          <li>
            <Link href="/student/examinations/re-exam" className={optionClass}>
              <ClipboardPenLineIcon aria-hidden="true" className="size-6 text-brand" />
              <span className="font-semibold">Apply for Re-exam</span>
            </Link>
          </li>
          <li id="exam-panel" className="scroll-mt-24">
            {panel ? (
              <a
                href={panel.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Login to Exam Panel (opens in a new tab)"
                className={optionClass}
              >
                <MonitorSmartphoneIcon aria-hidden="true" className="size-6 text-brand" />
                <span className="flex items-center gap-2 font-semibold">
                  Login to Exam Panel
                  <ExternalLinkIcon aria-hidden="true" className="size-4" />
                </span>
              </a>
            ) : (
              <div className={`${optionClass} cursor-default hover:bg-card`}>
                <MonitorSmartphoneIcon
                  aria-hidden="true"
                  className="size-6 text-muted-foreground"
                />
                <span>
                  <span className="block font-semibold">Login to Exam Panel</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Not yet available
                  </span>
                </span>
              </div>
            )}
          </li>
        </ul>
      )}
    </>
  );
}

/** Apply for Exam: the examination records of the student's own courses, with the exam fee status. */
export function StudentExamApply({ data }: { data: StudentExaminations | null }) {
  return (
    <>
      <PageIntro title="Apply for Exam" />
      {data === null ? (
        <LoadError />
      ) : data.registrations.length === 0 ? (
        <PortalCard title="Examinations" icon={CalendarDaysIcon}>
          <PortalEmptyState
            icon={CalendarDaysIcon}
            title="No registrations on record"
            description="Contact the registrar’s office if you believe a registration is missing."
          />
        </PortalCard>
      ) : (
        <div className="flex flex-col gap-5">
          {data.registrations.map((registration) => (
            <PortalCard
              key={registration.registrationId}
              title={`${registration.program.name} · ${registration.registrationNumber}`}
              icon={CalendarDaysIcon}
            >
              <p className="text-meta mb-3">
                Academic session {registration.academicSession.name}
                {registration.curriculum
                  ? ` · Syllabus ${registration.curriculum.versionCode} (${registration.curriculum.structureType === 'YEAR_WISE' ? 'year-wise' : 'semester-wise'})`
                  : ''}
              </p>
              {registration.curriculum === null ? (
                <PortalEmptyState
                  icon={CalendarDaysIcon}
                  title="No syllabus assigned yet"
                  description="The university has not assigned a curriculum version to this registration yet, so no examination information can be shown. Contact the registrar’s office."
                />
              ) : (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-navy-950">
                    {registration.curriculum.structureType === 'YEAR_WISE' ? 'Years' : 'Semesters'}
                  </h3>
                  <ul aria-label="Course periods" className="mb-4 flex flex-wrap gap-2">
                    {registration.curriculum.periods.map((period) => (
                      <li
                        key={period.number}
                        className="rounded-md border border-border px-2.5 py-1 text-sm text-navy-950"
                      >
                        {period.label}
                      </li>
                    ))}
                  </ul>
                  <h3 className="mb-2 text-sm font-semibold text-navy-950">Examination records</h3>
                  {registration.examinations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No examination records have been published for your course yet. The university
                      announces examinations through its usual process.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {registration.examinations.map((exam) => (
                        <li key={exam.id} className="flex flex-col gap-0.5 px-4 py-3">
                          <span className="font-medium break-words text-navy-950">{exam.name}</span>
                          <span className="text-meta">
                            {EXAMINATION_KIND_LABELS[exam.kind]} · {exam.period.label} ·{' '}
                            {exam.examSession}
                          </span>
                          {exam.kind === 'REGULAR' && (
                            <PaymentButtonPanel
                              service="EXAM"
                              path={`exam/${registration.registrationId}/${exam.id}`}
                            />
                          )}
                          {exam.reExamApplicationsOpen && (
                            <span className="text-sm text-navy-950">
                              Re-exam applications are open for this examination.
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </PortalCard>
          ))}
        </div>
      )}
    </>
  );
}
