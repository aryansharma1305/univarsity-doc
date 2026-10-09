import Link from 'next/link';
import {
  periodUnit,
  type StudentCurriculum,
  type StudentMe,
  type StudentProfileRequest,
} from '@docversity/validation';
import {
  BellIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  HistoryIcon,
  LockKeyholeIcon,
  PencilLineIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from 'lucide-react';
import { RecordStatus } from '@/components/data/status';
import { formatDate } from '@/lib/format';
import { DetailList, PageIntro, PortalCard, PortalEmptyState } from './portal-ui';
import { ProfileRequestCard } from './profile-requests';
import { ProfileUpdateForm } from './profile-update';
import { StudentAvatar } from './student-avatar';

export function StudentProfile({
  me,
  requests,
}: {
  me: StudentMe;
  /** The student's own requests, newest first; null when they could not be loaded. */
  requests: StudentProfileRequest[] | null;
}) {
  const { student } = me;
  const pending = requests?.find((request) => request.status === 'PENDING');
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
          <StudentAvatar name={student.fullName} hasPhoto={student.hasPhoto} size="lg" />
          <h2 className="mt-5 text-card-title break-words text-navy-950">{student.fullName}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {student.hasPhoto
              ? 'Official photo on record.'
              : 'Photo: Not on record. Initials shown instead.'}
          </p>
          <Link
            href="/student/profile/requests"
            className="mt-4 rounded text-sm font-medium text-brand hover:underline"
          >
            My update requests
            {requests && requests.length > 0 ? ` (${String(requests.length)})` : ''}
          </Link>
        </section>
        <div className="flex min-w-0 flex-col gap-5">
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
                { label: 'Photo', value: student.hasPhoto ? 'On record' : null },
              ]}
            />
            <div className="mt-6 rounded-lg bg-info-soft p-4 text-sm text-navy-950">
              <p className="font-semibold">Official records are read-only</p>
              <p className="mt-1 leading-relaxed">
                You cannot change them directly. Submit missing details, a photo or a correction
                below; the university reviews every request before your record is updated. Academic
                details (program, session, registration) are changed only by the registrar’s office.
              </p>
            </div>
          </PortalCard>
          <PortalCard
            title="Update my details"
            icon={PencilLineIcon}
            action={{ href: '/student/profile/requests', label: 'Request history' }}
          >
            {requests === null ? (
              <p role="alert" className="text-sm text-danger-text">
                Your update requests could not be loaded right now. Refresh the page to try again.
              </p>
            ) : pending ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-navy-950">
                  You have a request waiting for review. You can submit another once it is decided,
                  or cancel it to change what you asked for.
                </p>
                <ProfileRequestCard request={pending} />
              </div>
            ) : (
              <ProfileUpdateForm me={me} />
            )}
          </PortalCard>
        </div>
      </div>
    </>
  );
}

export function StudentProfileRequests({
  requests,
  submitted = false,
}: {
  requests: StudentProfileRequest[] | null;
  /** Arrived here right after submitting a request. */
  submitted?: boolean;
}) {
  return (
    <>
      <PageIntro
        title="Profile update requests"
        description="Every change you have asked for and the university’s decision."
      />
      {submitted && (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft p-4 text-sm"
        >
          <CheckCircle2Icon
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-success-text"
          />
          <div>
            <p className="font-semibold text-success-text">Request submitted for approval</p>
            <p className="mt-1 text-navy-950">
              The university will review it. Your official profile changes only if it is approved.
            </p>
          </div>
        </div>
      )}
      {requests === null ? (
        <PortalCard title="Requests" icon={HistoryIcon}>
          <p role="alert" className="text-sm text-danger-text">
            Your requests could not be loaded right now. Refresh the page to try again.
          </p>
        </PortalCard>
      ) : requests.length === 0 ? (
        <PortalCard title="Requests" icon={HistoryIcon}>
          <PortalEmptyState
            icon={HistoryIcon}
            title="No requests yet"
            description="When you submit missing details, a photo or a correction, it will appear here with its decision."
          >
            <Link
              href="/student/profile"
              className="mt-2 rounded text-sm font-semibold text-brand hover:underline"
            >
              Update my details
            </Link>
          </PortalEmptyState>
        </PortalCard>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((request) => (
            <ProfileRequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </>
  );
}

const CLASSIFICATION: Record<string, string> = {
  THEORY: 'Theory',
  PRACTICAL: 'Practical',
  COMBINED: 'Theory + practical',
};

type RegistrationCurriculum = StudentCurriculum['registrations'][number]['curriculum'];

/** The syllabus version a registration follows, period by period (read-only). */
function CurriculumSection({ curriculum }: { curriculum: RegistrationCurriculum | undefined }) {
  if (curriculum === undefined) {
    return (
      <div className="mt-5 rounded-lg bg-muted/50 p-4 text-sm">
        <p role="status" className="font-semibold text-navy-950">
          Curriculum temporarily unavailable
        </p>
        <p className="mt-1 text-foreground/80">
          We could not load your syllabus and subjects. Please try again.
        </p>
        <a
          href="/student/course"
          className="mt-2 inline-flex min-h-10 items-center rounded text-brand underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Reload course details
        </a>
      </div>
    );
  }
  if (curriculum === null) {
    return (
      <div className="mt-5 rounded-lg bg-muted/50 p-4 text-sm">
        <p className="font-semibold text-navy-950">Curriculum not assigned yet</p>
        <p className="mt-1 text-foreground/80">
          The university assigns the syllabus version you follow. Your subjects will appear here
          once it does.
        </p>
      </div>
    );
  }
  return (
    <section aria-label={`Curriculum ${curriculum.name}`} className="mt-5 flex flex-col gap-3">
      <div>
        <h4 className="text-sm font-semibold text-navy-950">
          Curriculum: {curriculum.name} ({curriculum.versionCode})
        </h4>
        <p className="text-meta">
          {curriculum.structureType === 'YEAR_WISE' ? 'Year-wise' : 'Semester-wise'} ·{' '}
          {periodUnit(curriculum.structureType, curriculum.numberOfPeriods)}
        </p>
      </div>
      {curriculum.periods.map((period) => (
        <div key={period.number} className="rounded-lg border border-border">
          <p className="border-b border-border bg-muted/50 px-3 py-2 text-sm font-medium text-navy-950">
            {period.label}
          </p>
          {period.subjects.length === 0 ? (
            <p className="px-3 py-2 text-sm text-foreground/80">No subjects listed.</p>
          ) : (
            <ul className="divide-y divide-border">
              {period.subjects.map((subject) => (
                <li
                  key={subject.code}
                  className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 break-words">
                    <span className="font-medium text-navy-950">{subject.code}</span> {subject.name}
                  </span>
                  <span className="text-foreground/80">
                    {[
                      subject.classification ? CLASSIFICATION[subject.classification] : null,
                      subject.credits !== null ? `${String(subject.credits)} credits` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

export function StudentCourses({
  me,
  curricula,
}: {
  me: StudentMe;
  /** From GET /student/curriculum; null when it could not be loaded (the section is then omitted). */
  curricula?: StudentCurriculum | null;
}) {
  const byRegistration = new Map(
    (curricula?.registrations ?? []).map((item) => [item.registrationId, item.curriculum]),
  );
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
            <CurriculumSection
              curriculum={
                byRegistration.has(registration.id)
                  ? byRegistration.get(registration.id)
                  : undefined
              }
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
    title: 'Results',
    icon: ClipboardListIcon,
    empty: 'Results are not available yet',
    description:
      'Subject marks, grades and official results are planned. Contact the examination office for current result information; examination links are on the Examinations page.',
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
