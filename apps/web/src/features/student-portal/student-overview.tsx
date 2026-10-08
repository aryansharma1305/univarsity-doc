import Link from 'next/link';
import type { StudentMe } from '@docversity/validation';
import {
  ArrowRightIcon,
  BellIcon,
  BookOpenIcon,
  ClipboardListIcon,
  FileTextIcon,
  HistoryIcon,
  LifeBuoyIcon,
  UserRoundIcon,
} from 'lucide-react';
import { RecordStatus, STATUS_LABELS } from '@/components/data/status';
import { formatDate } from '@/lib/format';
import { primaryRegistration, type StudentNavHref } from './nav';
import { DetailList, PortalCard, PortalEmptyState } from './portal-ui';
import { StudentAvatar } from './student-avatar';

const ACTIONS = [
  {
    href: '/student/profile',
    label: 'My Profile',
    detail: 'Personal information',
    icon: UserRoundIcon,
  },
  {
    href: '/student/results',
    label: 'My Results',
    detail: 'Not available yet',
    icon: ClipboardListIcon,
  },
  {
    href: '/student/documents',
    label: 'My Documents',
    detail: 'Not available yet',
    icon: FileTextIcon,
  },
  {
    href: '/student/course',
    label: 'Course Details',
    detail: 'Your registrations',
    icon: BookOpenIcon,
  },
] satisfies { href: StudentNavHref; label: string; detail: string; icon: typeof UserRoundIcon }[];

export function StudentOverview({ me }: { me: StudentMe }) {
  const { student, registrations } = me;
  const registration = primaryRegistration(registrations);
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
        {ACTIONS.map(({ href, label, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-xl bg-navy-900 p-4 text-white transition-colors hover:bg-brand sm:p-5"
          >
            <Icon aria-hidden="true" className="size-6 shrink-0 text-white/90" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-1 block text-xs text-white/80">{detail}</span>
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="ml-auto hidden size-4 shrink-0 sm:block"
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
                  value: student.hasPhoto ? 'On record · display not available yet' : null,
                },
              ]}
            />
            <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
              Official details are read-only. Contact the registrar’s office for corrections.
            </p>
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
            <PortalEmptyState
              icon={BellIcon}
              title="No activity available"
              description="Your recent student activity will appear here when this service is available."
            />
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
