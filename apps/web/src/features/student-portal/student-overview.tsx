import Link from 'next/link';
import {
  HISTORICAL_DOCUMENT_TYPE_LABELS,
  type StudentDocument,
  type StudentMe,
  type StudentProfileRequest,
  type StudentReExamApplication,
  RE_EXAM_STATUS_LABELS,
  RE_EXAM_PAYMENT_STATUS_LABELS,
} from '@docversity/validation';
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileTextIcon,
  HistoryIcon,
  SendIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  XCircleIcon,
} from 'lucide-react';
import { RecordStatus } from '@/components/data/status';
import { cn } from '@docversity/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { primaryRegistration, type StudentNavHref } from './nav';
import { PortalCard, PortalEmptyState, SoonBadge } from './portal-ui';
import { StudentAvatar } from './student-avatar';
import { StudentActionMotion, StudentDashboardMotion } from './student-motion';

const ACTIONS = [
  {
    href: '/student/documents',
    label: 'My Documents',
    detail: 'Certificates & records',
    icon: FileTextIcon,
  },
  {
    href: '/student/examinations',
    label: 'Examinations',
    detail: 'Exam app & information',
    icon: ClipboardListIcon,
  },
  {
    href: '/student/course',
    label: 'My Course',
    detail: 'Syllabus & subjects',
    icon: BookOpenIcon,
  },
  {
    href: '/student/profile',
    label: 'My Profile',
    detail: 'Details & corrections',
    icon: UserRoundIcon,
  },
] satisfies { href: StudentNavHref; label: string; detail: string; icon: typeof UserRoundIcon }[];

const ACTIVITY_TONE = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  neutral: 'bg-muted text-muted-foreground',
} as const;

interface ActivityEvent {
  key: string;
  title: string;
  at: string;
  icon: typeof UserRoundIcon;
  tone: keyof typeof ACTIVITY_TONE;
}

const DECISIONS = {
  APPROVED: { title: 'Profile update approved', icon: CheckCircle2Icon, tone: 'success' },
  REJECTED: { title: 'Profile update rejected', icon: XCircleIcon, tone: 'danger' },
  CANCELLED: { title: 'Profile update cancelled', icon: XCircleIcon, tone: 'neutral' },
} as const;

/** The student's real events, newest first (no staff audit data). */
function activityOf(me: StudentMe, requests: readonly StudentProfileRequest[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  if (me.account.activatedAt) {
    events.push({
      key: 'activated',
      title: 'Student account activated',
      at: me.account.activatedAt,
      icon: ShieldCheckIcon,
      tone: 'success',
    });
  }
  for (const request of requests) {
    events.push({
      key: `${request.id}-submitted`,
      title: 'Profile update submitted',
      at: request.submittedAt,
      icon: SendIcon,
      tone: 'warning',
    });
    if (request.status !== 'PENDING' && request.decidedAt) {
      events.push({
        key: `${request.id}-decided`,
        at: request.decidedAt,
        ...DECISIONS[request.status],
      });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
}

export function StudentOverview({
  me,
  requests = [],
  documents = [],
  applications = [],
}: {
  me: StudentMe;
  requests?: readonly StudentProfileRequest[] | null;
  documents?: readonly StudentDocument[] | null;
  applications?: readonly StudentReExamApplication[] | null;
}) {
  const { student, registrations } = me;
  const registration = primaryRegistration(registrations);
  const activity = activityOf(me, requests ?? []);
  const pending = requests?.find((request) => request.status === 'PENDING');
  return (
    <StudentDashboardMotion>
      <div data-student-welcome>
        <h1 className="font-heading text-[26px] leading-tight font-semibold tracking-[-0.025em] break-words text-navy-950 sm:text-3xl">
          Welcome, {student.fullName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your academic workspace, all in one place.
        </p>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section
          data-student-identity
          aria-label="Student overview"
          className="relative overflow-hidden rounded-2xl bg-navy-950 p-5 text-white sm:p-7"
        >
          <div
            aria-hidden="true"
            className="absolute -top-16 -right-16 size-56 rounded-full border border-white/10"
          />
          <div className="relative flex items-start gap-4">
            <StudentAvatar
              name={student.fullName}
              hasPhoto={student.hasPhoto}
              size="md"
              className="ring-white/15"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-xl leading-snug font-semibold break-words">
                {student.fullName}
              </h2>
              <p className="mt-1 text-sm text-white/75">
                {registration?.program.name ?? 'Student account'}
              </p>
            </div>
          </div>
          {registration ? (
            <>
              <div className="relative mt-6 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-white/70">Registration number</p>
                  <h3 className="mt-1 text-base font-semibold break-all tabular-nums sm:text-lg">
                    {registration.registrationNumber}
                  </h3>
                </div>
                <RecordStatus status={registration.status} />
              </div>
              <div className="relative mt-5 flex flex-wrap justify-between gap-2 border-t border-white/15 pt-4 text-xs text-white/75">
                <span className="break-words">{registration.academicSession.name}</span>
                <span>{registration.department?.name ?? 'Department not on record'}</span>
              </div>
            </>
          ) : (
            <p className="relative mt-5 text-sm text-white/80">
              No registration is linked to your account.
            </p>
          )}
        </section>
        <section aria-labelledby="academic-overview" className="min-w-0 py-1 xl:py-3">
          <h2 id="academic-overview" className="font-heading text-lg font-semibold text-navy-950">
            Academic overview
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 xl:mt-5">
            <div data-student-academic className="col-span-2 hidden xl:block">
              <dt className="text-xs text-muted-foreground">Enrolled program</dt>
              <dd className="mt-1 text-base font-semibold break-words text-navy-950">
                {registration?.program.name ?? 'Not on record'}
              </dd>
            </div>
            <div data-student-academic>
              <dt className="text-xs text-muted-foreground">Academic session</dt>
              <dd className="mt-1 text-sm font-medium break-words text-navy-950">
                {registration?.academicSession.name ?? 'Not on record'}
              </dd>
            </div>
            <div data-student-academic>
              <dt className="text-xs text-muted-foreground">Admission date</dt>
              <dd className="mt-1 text-sm font-medium text-navy-950">
                {registration?.admissionDate
                  ? formatDate(registration.admissionDate)
                  : 'Not on record'}
              </dd>
            </div>
          </dl>
          {registrations.length > 1 && (
            <Link
              href="/student/course"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand"
            >
              View all {registrations.length} registrations{' '}
              <ArrowRightIcon aria-hidden="true" className="ml-2 size-4" />
            </Link>
          )}
        </section>
      </div>
      <nav data-student-actions aria-label="Quick actions">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACTIONS.map(({ href, label, detail, icon: Icon }) => (
            <StudentActionMotion key={href}>
              <Link
                href={href}
                className="group flex h-full min-h-24 flex-col justify-between gap-3 rounded-xl bg-card p-4 text-navy-950 ring-1 ring-border transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Icon aria-hidden="true" className="size-5 text-brand" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 hidden text-xs text-muted-foreground group-hover:text-navy-900 sm:block">
                    {detail}
                  </span>
                </span>
              </Link>
            </StudentActionMotion>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <Link
            href="/student/examinations/re-exam/applications"
            className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-medium text-brand hover:underline"
          >
            Re-exam applications <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
          <Link
            href="/student/results"
            className="inline-flex min-h-11 items-center gap-2 rounded text-xs text-muted-foreground hover:text-navy-950"
          >
            My Results <SoonBadge />
          </Link>
        </div>
      </nav>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <PortalCard
          title="My requests"
          className="[&_svg]:text-violet-700"
          icon={HistoryIcon}
          action={{ href: '/student/profile/requests', label: 'Profile requests' }}
        >
          {requests === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              Profile requests could not be loaded.{' '}
              <Link href="/student/profile/requests" className="text-brand underline">
                Try the request history
              </Link>
              .
            </p>
          ) : pending ? (
            <div className="mb-4 rounded-lg bg-warning-soft p-4">
              <p className="text-sm font-semibold text-warning-text">
                Profile update pending review
              </p>
              <p className="mt-1 text-sm text-navy-950">
                Your official details stay unchanged until the university approves your request.
              </p>
              <Link
                href="/student/profile/requests"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand"
              >
                Track my request <ArrowRightIcon aria-hidden="true" className="ml-2 size-4" />
              </Link>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">
              No profile update is waiting for review.
            </p>
          )}
          {applications === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              Re-exam applications could not be loaded. Open applications to try again.
            </p>
          ) : applications.length ? (
            <ul aria-label="Re-exam application status" className="divide-y divide-border">
              {applications.slice(0, 3).map((app) => (
                <li key={app.id} className="py-3 first:pt-0">
                  <Link
                    href="/student/examinations/re-exam/applications"
                    className="block rounded text-sm font-semibold break-words text-navy-950 hover:text-brand"
                  >
                    {app.subject.code} · {app.subject.name}
                  </Link>
                  <dl className="mt-2 grid gap-1 text-xs">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Application:</dt>
                      <dd className="font-medium text-navy-950">
                        {RE_EXAM_STATUS_LABELS[app.status]}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Payment:</dt>
                      <dd className="font-medium text-navy-950">
                        {app.payment
                          ? RE_EXAM_PAYMENT_STATUS_LABELS[app.payment.status]
                          : 'Not started'}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No re-exam applications yet.</p>
          )}
          <Link
            href="/student/examinations/re-exam/applications"
            className="mt-3 inline-flex min-h-11 items-center self-start rounded text-sm font-medium text-brand hover:underline"
          >
            View re-exam applications
          </Link>
        </PortalCard>
        <PortalCard
          title="Documents"
          icon={FileTextIcon}
          action={{ href: '/student/documents', label: 'View all' }}
        >
          {documents === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              Documents could not be loaded. Open your document library to try again.
            </p>
          ) : documents.length === 0 ? (
            <PortalEmptyState
              icon={FileTextIcon}
              title="No documents published yet"
              description="Certificates and records the university publishes to you will appear here."
            />
          ) : (
            <ul aria-label="Published documents" className="divide-y divide-border">
              {documents.slice(0, 3).map((document) => (
                <li key={document.id} className="py-3 first:pt-0">
                  <Link
                    href="/student/documents"
                    className="flex min-h-11 items-center justify-between gap-3 rounded text-sm font-medium break-words text-navy-950 hover:text-brand"
                  >
                    <span>{document.title}</span>
                    <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {HISTORICAL_DOCUMENT_TYPE_LABELS[document.documentType]}
                    {document.issuedOn ? ` · Issued ${formatDate(document.issuedOn)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PortalCard>
      </div>
      <section aria-labelledby="activity-title" className="border-t border-border pt-5">
        <h2 id="activity-title" className="font-heading text-lg font-semibold text-navy-950">
          Recent activity
        </h2>
        {activity.length ? (
          <ol
            aria-label="Recent activity"
            className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {activity.slice(0, 3).map((event) => (
              <li key={event.key} className="flex gap-3">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    ACTIVITY_TONE[event.tone],
                  )}
                >
                  <event.icon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-navy-950">{event.title}</p>
                  <time dateTime={event.at} className="mt-1 block text-xs text-muted-foreground">
                    {formatDateTime(event.at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No activity available</p>
        )}
      </section>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>Results are not available yet</p>
        <Link
          href="/help"
          className="inline-flex min-h-11 items-center rounded font-medium text-brand hover:underline"
        >
          Need help? Contact your university
        </Link>
      </footer>
    </StudentDashboardMotion>
  );
}
