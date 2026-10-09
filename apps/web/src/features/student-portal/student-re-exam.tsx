'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ClipboardPenLineIcon, InfoIcon } from 'lucide-react';
import {
  formatMoney,
  RE_EXAM_FEE_BLOCKED_MESSAGES,
  RE_EXAM_FEE_SCOPE_LABELS,
  type StudentReExamOptions,
  studentReExamApplicationSchema,
} from '@docversity/validation';
import { errorMessage, studentRequest } from '@/lib/api';
import { DetailList, PageIntro, PortalCard, PortalEmptyState } from './portal-ui';

type SubjectOption =
  StudentReExamOptions['registrations'][number]['examinations'][number]['subjects'][number];

function feeLine(fee: SubjectOption['fee']): string {
  if (fee.status === 'ASSESSED' && fee.amountMinor !== null && fee.currency) {
    return `Fee ${formatMoney(fee.amountMinor, fee.currency)}${fee.scope ? ` (${RE_EXAM_FEE_SCOPE_LABELS[fee.scope].toLowerCase()})` : ''}`;
  }
  return fee.blockedReason
    ? RE_EXAM_FEE_BLOCKED_MESSAGES[fee.blockedReason]
    : 'Fee not configured yet.';
}

const primaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50';

/**
 * The re-exam application form. Name, registration number, course, session and semester/year come
 * from the student's own registration and are shown read-only. The student chooses only the
 * registration (if several), the re-examination and the subject; attempt and fee are the server's.
 */
export function StudentReExamApply({ options }: { options: StudentReExamOptions | null }) {
  const router = useRouter();
  const registrations = options?.registrations ?? [];
  const [registrationId, setRegistrationId] = useState(registrations[0]?.registrationId ?? '');
  const [examinationId, setExaminationId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registration = registrations.find((r) => r.registrationId === registrationId);
  const exam = registration?.examinations.find((e) => e.id === examinationId);
  const subject = exam?.subjects.find((s) => s.programSubjectId === subjectId);

  const intro = (
    <PageIntro
      title="Apply for a re-examination"
      description="Choose the re-examination and the subject. Your details come from your registration and cannot be changed here."
    />
  );
  if (options === null) {
    return (
      <>
        {intro}
        <PortalCard title="Re-examination" icon={ClipboardPenLineIcon}>
          <p role="alert" className="text-sm text-danger-text">
            Re-examination information could not be loaded right now. Refresh the page to try again.
          </p>
        </PortalCard>
      </>
    );
  }

  const submit = async () => {
    if (!registration || !exam || !subject) return;
    setPending(true);
    setError(null);
    try {
      const saved = await studentRequest(
        'POST',
        'student/re-exam-applications',
        studentReExamApplicationSchema,
        {
          body: {
            registrationId: registration.registrationId,
            examinationId: exam.id,
            programSubjectId: subject.programSubjectId,
          },
        },
      );
      toast.success(`Application ${saved.reference} submitted.`);
      router.push('/student/examinations/re-exam/applications');
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };

  return (
    <>
      {intro}
      <div className="flex flex-col gap-5">
        {registrations.length > 1 && (
          <PortalCard title="Your registration" icon={ClipboardPenLineIcon}>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Choose your registration</legend>
              {registrations.map((r) => (
                <label
                  key={r.registrationId}
                  className="flex items-center gap-2 text-sm text-navy-950"
                >
                  <input
                    type="radio"
                    name="registration"
                    className="size-4 accent-brand"
                    checked={registrationId === r.registrationId}
                    onChange={() => {
                      setRegistrationId(r.registrationId);
                      setExaminationId('');
                      setSubjectId('');
                    }}
                  />
                  {r.registrationNumber} · {r.program.name}
                </label>
              ))}
            </fieldset>
          </PortalCard>
        )}
        {registration && (
          <PortalCard title="Your details (from university records)" icon={InfoIcon}>
            <DetailList
              columns={2}
              items={[
                { label: 'Student name', value: registration.studentName },
                { label: 'Registration number', value: registration.registrationNumber },
                {
                  label: 'Course',
                  value: `${registration.program.name} (${registration.program.code})`,
                },
                {
                  label: 'Admission batch / academic session',
                  value: registration.academicSessionName,
                },
                {
                  label: 'Semester / year',
                  value: exam?.period.label ?? null,
                  missing: 'Chosen with the re-examination',
                },
              ]}
            />
          </PortalCard>
        )}
        <PortalCard title="Re-examination and subject" icon={ClipboardPenLineIcon}>
          {!registration ? (
            <PortalEmptyState
              icon={ClipboardPenLineIcon}
              title="No registration found"
              description="Contact the registrar’s office."
            />
          ) : registration.unavailableReason ? (
            <PortalEmptyState
              icon={ClipboardPenLineIcon}
              title="Online application is not available"
              description={registration.unavailableReason}
            />
          ) : registration.examinations.length === 0 ? (
            <PortalEmptyState
              icon={ClipboardPenLineIcon}
              title="No re-examination is open for applications"
              description="There is currently no re-examination of your course accepting applications. The university announces re-examinations through its usual process."
            />
          ) : (
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold text-navy-950">Re-examination</legend>
                {registration.examinations.map((e) => (
                  <label key={e.id} className="flex items-start gap-2 text-sm text-navy-950">
                    <input
                      type="radio"
                      name="examination"
                      className="mt-0.5 size-4 accent-brand"
                      checked={examinationId === e.id}
                      onChange={() => {
                        setExaminationId(e.id);
                        setSubjectId('');
                      }}
                    />
                    <span>
                      {e.name}
                      <span className="block text-meta">
                        {e.period.label} · {e.examSession}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {exam && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold text-navy-950">
                    Subject ({exam.period.label})
                  </legend>
                  {exam.subjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No subjects are listed for this semester or year in your syllabus.
                    </p>
                  ) : (
                    exam.subjects.map((s) => (
                      <label
                        key={s.programSubjectId}
                        className={`flex items-start gap-2 text-sm ${s.alreadyApplied ? 'text-muted-foreground' : 'text-navy-950'}`}
                      >
                        <input
                          type="radio"
                          name="subject"
                          className="mt-0.5 size-4 accent-brand"
                          disabled={s.alreadyApplied}
                          checked={subjectId === s.programSubjectId}
                          onChange={() => {
                            setSubjectId(s.programSubjectId);
                          }}
                        />
                        <span>
                          {s.code} — {s.name}
                          <span className="block text-meta">
                            {s.alreadyApplied
                              ? 'You have already applied for this subject.'
                              : `Re-exam attempt ${String(s.attemptNumber)} · ${feeLine(s.fee)}`}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </fieldset>
              )}
              <p className="flex gap-2 rounded-lg bg-info-soft p-3 text-sm text-navy-950">
                <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  Submitting an application does not register you for the examination: the
                  university reviews it and records its decision. Payment, where a fee applies, is
                  checked by university staff.
                </span>
              </p>
              {error && (
                <p role="alert" className="text-sm text-danger-text">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={!subject || pending}
                  onClick={() => void submit()}
                >
                  {pending ? 'Submitting…' : 'Submit application'}
                </button>
                <Link
                  href="/student/examinations/re-exam/applications"
                  className="inline-flex h-10 items-center text-sm font-medium text-brand underline underline-offset-2"
                >
                  My re-exam applications
                </Link>
              </div>
            </div>
          )}
        </PortalCard>
      </div>
    </>
  );
}
