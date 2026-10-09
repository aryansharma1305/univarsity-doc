import {
  CalendarDaysIcon,
  ClipboardCheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  InfoIcon,
  MonitorSmartphoneIcon,
} from 'lucide-react';
import { EXAMINATION_KIND_LABELS, type StudentExaminations } from '@docversity/validation';
import { PageIntro, PortalCard, PortalEmptyState } from './portal-ui';

const linkButton =
  'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function ExamApplications({ apps }: { apps: StudentExaminations['applications'] }) {
  return (
    <PortalCard title="Examination application" icon={MonitorSmartphoneIcon}>
      <p className="mb-4 flex gap-2 rounded-lg bg-info-soft p-3 text-sm text-navy-950">
        <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Examinations are taken in the university’s separate examination application,{' '}
          <strong>not in this portal</strong>. Downloading or opening the application does not
          register you for an examination — the university informs you about examinations through
          its usual process.
        </span>
      </p>
      {apps.length === 0 ? (
        <PortalEmptyState
          icon={MonitorSmartphoneIcon}
          title="Examination application not configured yet"
          description="The university has not added its examination application link here yet. Contact the examination office for access."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {apps.map((app) => (
            <section key={app.id} aria-label={app.name} className="flex flex-col gap-3">
              <h3 className="text-base font-semibold break-words text-navy-950">{app.name}</h3>
              <div className="flex flex-wrap gap-2">
                <a
                  href={app.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open the official website of ${app.name} (opens in a new tab)`}
                  className={`${linkButton} bg-primary text-primary-foreground hover:bg-brand-hover`}
                >
                  <ExternalLinkIcon aria-hidden="true" className="size-4" />
                  Open official website
                </a>
                {app.androidUrl && (
                  <a
                    href={app.androidUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Download ${app.name} for Android (opens in a new tab)`}
                    className={`${linkButton} border border-border bg-card text-navy-950 hover:bg-muted`}
                  >
                    <DownloadIcon aria-hidden="true" className="size-4" />
                    Download for Android
                  </a>
                )}
                {app.iosUrl && (
                  <a
                    href={app.iosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Download ${app.name} for iPhone or iPad (opens in a new tab)`}
                    className={`${linkButton} border border-border bg-card text-navy-950 hover:bg-muted`}
                  >
                    <DownloadIcon aria-hidden="true" className="size-4" />
                    Download for iPhone / iPad
                  </a>
                )}
              </div>
              {app.instructions && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-meta mb-1">Instructions from the university</p>
                  <p className="text-sm whitespace-pre-line text-navy-950">{app.instructions}</p>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </PortalCard>
  );
}

export function StudentExaminationsPage({ data }: { data: StudentExaminations | null }) {
  return (
    <>
      <PageIntro
        title="Examinations"
        description="Links to the university’s examination application, and the examination records of your course by semester or year."
      />
      {data === null ? (
        <PortalCard title="Examinations" icon={ClipboardCheckIcon}>
          <p role="alert" className="text-sm text-danger-text">
            Your examination information could not be loaded right now. Refresh the page to try
            again.
          </p>
        </PortalCard>
      ) : (
        <div className="flex flex-col gap-5">
          <ExamApplications apps={data.applications} />
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
