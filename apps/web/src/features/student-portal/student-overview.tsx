import Link from 'next/link';
import type { StudentMe } from '@docversity/validation';
import {
  ArrowRightIcon,
  ClipboardListIcon,
  FileTextIcon,
  HistoryIcon,
  UserRoundIcon,
} from 'lucide-react';
import { RecordStatus } from '@/components/data/status';
import { formatDate } from '@/lib/format';
import { primaryRegistration, type StudentNavHref } from './nav';
import { StudentAvatar } from './student-avatar';
import { StudentActionMotion, StudentDashboardMotion } from './student-motion';

const ACTIONS = [
  {
    href: '/student/profile',
    label: 'My Profile',
    detail: 'Details & course',
    icon: UserRoundIcon,
  },
  {
    href: '/student/requests',
    label: 'My Requests',
    detail: 'Profile & certificate requests',
    icon: HistoryIcon,
  },
  {
    href: '/student/examinations',
    label: 'Examinations',
    detail: 'Exams & re-exams',
    icon: ClipboardListIcon,
  },
  {
    href: '/student/documents',
    label: 'My Documents',
    detail: 'Records & uploads',
    icon: FileTextIcon,
  },
] satisfies { href: StudentNavHref; label: string; detail: string; icon: typeof UserRoundIcon }[];

export function StudentOverview({ me }: { me: StudentMe }) {
  const { student, registrations } = me;
  const registration = primaryRegistration(registrations);
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
              href="/student/profile#course-details"
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
      </nav>
      <footer className="flex flex-wrap justify-end gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
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
