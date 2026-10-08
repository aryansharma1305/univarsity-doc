import Link from 'next/link';
import type { StudentMe, StudentProfileRequest } from '@docversity/validation';
import {
  ArrowRightIcon,
  BellIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileTextIcon,
  HistoryIcon,
  LifeBuoyIcon,
  SendIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  XCircleIcon,
} from 'lucide-react';
import { RecordStatus, STATUS_LABELS } from '@/components/data/status';
import { cn } from '@docversity/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { primaryRegistration, type StudentNavHref } from './nav';
import { DetailList, PortalCard, PortalEmptyState, SoonBadge } from './portal-ui';
import { StudentAvatar } from './student-avatar';

const ACTIONS = [
  {
    href: '/student/profile',
    label: 'My Profile',
    available: true,
    detail: 'View or update details',
    icon: UserRoundIcon,
  },
  {
    href: '/student/results',
    label: 'My Results',
    available: false,
    detail: 'Not available yet',
    icon: ClipboardListIcon,
  },
  {
    href: '/student/documents',
    label: 'My Documents',
    available: false,
    detail: 'Not available yet',
    icon: FileTextIcon,
  },
  {
    href: '/student/course',
    label: 'Course Details',
    available: true,
    detail: 'Your registrations',
    icon: BookOpenIcon,
  },
] satisfies {
  href: StudentNavHref;
  label: string;
  available: boolean;
  detail: string;
  icon: typeof UserRoundIcon;
}[];

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
}: {
  me: StudentMe;
  /** The student's own profile requests (newest first). */
  requests?: readonly StudentProfileRequest[];
}) {
  const { student, registrations } = me;
  const registration = primaryRegistration(registrations);
  const activity = activityOf(me, requests);
  const pendingRequest = requests.some((request) => request.status === 'PENDING');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title break-words text-navy-950">Welcome, {student.fullName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your academic records and university services, at a glance.
        </p>
      </div>
      <section
        aria-label="Student overview"
        className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between"
      >
        <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-5">
          <StudentAvatar
            name={student.fullName}
            hasPhoto={student.hasPhoto}
            size="lg"
            className="size-16 text-xl sm:size-24 sm:text-3xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-card-title break-words text-navy-950">{student.fullName}</h2>
              {registration && <RecordStatus status={registration.status} />}
            </div>
            {registration ? (
              <>
                <p className="mt-2 break-all text-sm text-navy-950">
                  Registration: <strong>{registration.registrationNumber}</strong>
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm text-navy-950">
                  <BookOpenIcon aria-hidden="true" className="size-4 shrink-0" />
                  {registration.program.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {registration.department?.name ?? 'Department not on record'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No registration is linked to your account.
              </p>
            )}
          </div>
        </div>
        <dl className="grid shrink-0 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2 xl:max-w-md xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0">
          <div>
            <dt className="text-muted-foreground">Academic session</dt>
            <dd className="mt-1 font-medium text-navy-950">
              {registration?.academicSession.name ?? 'Not on record'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Admission date</dt>
            <dd className="mt-1 font-medium text-navy-950">
              {registration?.admissionDate
                ? formatDate(registration.admissionDate)
                : 'Not on record'}
            </dd>
          </div>
        </dl>
      </section>
      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {ACTIONS.map(({ href, label, available, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'group flex items-center gap-3 rounded-xl p-4 transition-colors sm:p-5',
              available
                ? 'bg-navy-900 text-white hover:bg-brand'
                : 'border border-dashed border-border-strong bg-card text-navy-950 hover:bg-secondary',
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'size-6 shrink-0',
                available ? 'text-white/90' : 'text-muted-foreground',
              )}
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                {label}
                {!available && <SoonBadge />}
              </span>
              <span
                className={cn(
                  'mt-1 block text-xs',
                  available ? 'text-white/80' : 'text-muted-foreground',
                )}
              >
                {detail}
              </span>
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className={cn(
                'ml-auto hidden size-4 shrink-0 sm:block',
                !available && 'text-muted-foreground',
              )}
            />
          </Link>
        ))}
      </nav>
      <div className="grid items-start gap-5 min-[1400px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <PortalCard
            title="Profile details"
            icon={UserRoundIcon}
            action={{ href: '/student/profile', label: 'View profile' }}
          >
            <DetailList
              items={[
                { label: 'Full name', value: student.fullName },
                {
                  label: 'Date of birth',
                  value: student.dateOfBirth ? formatDate(student.dateOfBirth) : null,
                },
                { label: 'Gender', value: student.gender },
                {
                  label: 'Photo',
                  value: student.hasPhoto ? 'On record' : null,
                },
              ]}
            />
            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-sm">
              {pendingRequest ? (
                <p className="font-medium text-warning-text">
                  An update you submitted is waiting for review.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Official details change only after the university approves a request.
                </p>
              )}
              <Link
                href={pendingRequest ? '/student/profile/requests' : '/student/profile'}
                className="self-start rounded font-semibold text-brand hover:underline"
              >
                {pendingRequest ? 'Track my request' : 'Update my details'}
              </Link>
            </div>
          </PortalCard>
          <PortalCard
            title="Academic overview"
            icon={BookOpenIcon}
            action={{ href: '/student/course', label: 'View details' }}
          >
            <DetailList
              items={[
                { label: 'Program', value: registration?.program.name },
                { label: 'Department', value: registration?.department?.name },
                { label: 'Academic session', value: registration?.academicSession.name },
                { label: 'Registrations', value: String(registrations.length) },
                {
                  label: 'Registration status',
                  value: registration
                    ? (STATUS_LABELS[registration.status] ?? registration.status)
                    : null,
                },
                { label: 'Results', value: 'Not available yet' },
              ]}
            />
          </PortalCard>
          <PortalCard title="Your registrations" icon={BookOpenIcon} className="xl:col-span-2">
            {registrations.length ? (
              <ul className="divide-y divide-border">
                {registrations.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col justify-between gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="break-all text-sm font-semibold text-navy-950">
                        {item.registrationNumber}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.program.name} · {item.academicSession.name}
                      </p>
                    </div>
                    <RecordStatus status={item.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No registrations on record.</p>
            )}
          </PortalCard>
          <PortalCard
            title="Documents"
            icon={FileTextIcon}
            action={{ href: '/student/documents', label: 'View status' }}
          >
            <PortalEmptyState
              icon={FileTextIcon}
              title="Documents are not available yet"
              description="Admission letters, transcripts and certificates will appear here when document services are enabled."
            />
          </PortalCard>
          <PortalCard
            title="Examinations & Results"
            icon={ClipboardListIcon}
            action={{ href: '/student/results', label: 'View status' }}
          >
            <PortalEmptyState
              icon={ClipboardListIcon}
              title="Results are not available yet"
              description="There are no results accessible through the portal yet. Contact the examination office for current result information."
            />
          </PortalCard>
        </div>
        <div className="flex flex-col gap-5">
          <PortalCard title="Recent activity" icon={HistoryIcon}>
            {activity.length > 0 ? (
              // Only real events of this student: account activation and their own profile requests.
              <ol aria-label="Recent activity" className="flex flex-col gap-4">
                {activity.map((event) => (
                  <li key={event.key} className="flex gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                        ACTIVITY_TONE[event.tone],
                      )}
                    >
                      <event.icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-navy-950">{event.title}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <PortalEmptyState
                icon={BellIcon}
                title="No activity available"
                description="Your recent student activity will appear here when this service is available."
              />
            )}
          </PortalCard>
          <PortalCard title="Need help?" icon={LifeBuoyIcon}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              For record corrections or account recovery, contact the registrar’s office through
              your university’s usual channel.
            </p>
            <Link
              href="/help"
              className="mt-5 inline-flex items-center gap-2 self-start rounded text-sm font-semibold text-brand hover:underline"
            >
              Portal help <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </PortalCard>
        </div>
      </div>
    </div>
  );
}
