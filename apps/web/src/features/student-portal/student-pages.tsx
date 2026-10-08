import type { StudentMe } from '@docversity/validation';
import {
  BellIcon,
  BookOpenIcon,
  ClipboardListIcon,
  FileTextIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from 'lucide-react';
import { RecordStatus } from '@/components/data/status';
import { formatDate } from '@/lib/format';
import { DetailList, PageIntro, PortalCard, PortalEmptyState } from './portal-ui';
import { StudentAvatar } from './student-avatar';

export function StudentProfile({ me }: { me: StudentMe }) {
  const { student } = me;
  return (
    <>
      <PageIntro
        title="My Profile"
        description="Your personal information as held by the university."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section
          aria-label="Student identity"
          className="flex flex-col items-center rounded-xl border border-border bg-card p-6 text-center"
        >
          <StudentAvatar name={student.fullName} size="lg" />
          <h2 className="mt-5 text-card-title break-words text-navy-950">{student.fullName}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {student.hasPhoto
              ? 'Photo on record. Display is not available yet.'
              : 'Photo: Not on record. Initials shown instead.'}
          </p>
        </section>
        <PortalCard title="Personal details" icon={UserRoundIcon}>
          <DetailList
            columns={2}
            items={[
              { label: 'Full name', value: student.fullName },
              {
                label: 'Date of birth',
                value: student.dateOfBirth ? formatDate(student.dateOfBirth) : null,
              },
              { label: 'Gender', value: student.gender },
              { label: 'Father’s name', value: student.fatherName },
              { label: 'Mother’s name', value: student.motherName },
            ]}
          />
          <div className="mt-6 rounded-lg bg-info-soft p-4 text-sm text-navy-950">
            <p className="font-semibold">Official records are read-only</p>
            <p className="mt-1 leading-relaxed">
              Profile submissions and approvals are not available yet. To add missing information or
              correct a detail, contact the registrar’s office.
            </p>
          </div>
        </PortalCard>
      </div>
    </>
  );
}

export function StudentCourses({ me }: { me: StudentMe }) {
  return (
    <>
      <PageIntro
        title="Course Details"
        description="Program and enrollment information for each of your university registrations."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        {me.registrations.map((registration) => (
          <PortalCard key={registration.id} title={registration.program.name} icon={BookOpenIcon}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="break-all text-sm font-semibold text-navy-950">
                {registration.registrationNumber}
              </h3>
              <RecordStatus status={registration.status} />
            </div>
            <DetailList
              items={[
                { label: 'Program', value: registration.program.name },
                { label: 'Program code', value: registration.program.code },
                { label: 'Department', value: registration.department?.name },
                { label: 'Academic session', value: registration.academicSession.name },
                { label: 'Session code', value: registration.academicSession.code },
                { label: 'Roll / reference number', value: registration.rollReferenceNumber },
                {
                  label: 'Admission date',
                  value: registration.admissionDate ? formatDate(registration.admissionDate) : null,
                },
                {
                  label: 'Completion date',
                  value: registration.completionDate
                    ? formatDate(registration.completionDate)
                    : null,
                },
              ]}
            />
          </PortalCard>
        ))}
      </div>
      {!me.registrations.length && (
        <PortalCard title="Registrations" icon={BookOpenIcon}>
          <PortalEmptyState
            icon={BookOpenIcon}
            title="No registrations on record"
            description="Contact the registrar’s office if you believe a registration is missing."
          />
        </PortalCard>
      )}
    </>
  );
}

export function StudentSettings({ me }: { me: StudentMe }) {
  return (
    <>
      <PageIntro
        title="Account Settings"
        description="Your student account and sign-in information."
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <PortalCard title="Student account" icon={ShieldCheckIcon}>
          <DetailList
            items={[
              { label: 'Account status', value: me.account.status },
              { label: 'Activated on', value: formatDate(me.account.activatedAt.slice(0, 10)) },
              { label: 'Sign-in method', value: 'Registration number and password' },
            ]}
          />
          <p className="mt-5 text-sm text-muted-foreground">
            This account provides access to your own student records. Staff access uses a separate
            sign-in.
          </p>
        </PortalCard>
        <PortalCard title="Password & account recovery" icon={LockKeyholeIcon}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            To reset a forgotten password, request a new activation code from the registrar’s office
            and use the account activation page. Changing your password from this screen is not
            available yet.
          </p>
          <a
            href="/help"
            className="mt-5 self-start rounded text-sm font-semibold text-brand hover:underline"
          >
            Read account access help
          </a>
        </PortalCard>
      </div>
    </>
  );
}

const PLANNED_MODULES = {
  results: {
    title: 'Examinations & Results',
    icon: ClipboardListIcon,
    empty: 'Results are not available yet',
    description:
      'Exam schedules, subject marks, grades and official results are planned. Contact the examination office for current result information.',
  },
  documents: {
    title: 'My Documents',
    icon: FileTextIcon,
    empty: 'Documents are not available yet',
    description:
      'Admission letters, certificates and transcripts will be listed here when document services are enabled. There are no documents available to view or download through this portal yet.',
  },
  notifications: {
    title: 'Notifications',
    icon: BellIcon,
    empty: 'Notifications are not available yet',
    description:
      'Student announcements and notifications are planned. Continue to use your university’s current communication channels.',
  },
} as const;

export function StudentUnavailable({ module }: { module: keyof typeof PLANNED_MODULES }) {
  const item = PLANNED_MODULES[module];
  return (
    <>
      <PageIntro
        title={item.title}
        description="This service is planned and is not available in your portal yet."
      />
      <PortalCard title="Service availability" icon={item.icon}>
        <PortalEmptyState icon={item.icon} title={item.empty} description={item.description} />
      </PortalCard>
    </>
  );
}
