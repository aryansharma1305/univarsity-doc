'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ClipboardListIcon } from 'lucide-react';
import { StatusBadge } from '@docversity/ui';
import {
  formatMoney,
  RE_EXAM_FEE_BLOCKED_MESSAGES,
  RE_EXAM_FEE_SCOPE_LABELS,
  RE_EXAM_STATUS_LABELS,
  type StudentReExamApplication,
  studentReExamApplicationSchema,
} from '@docversity/validation';
import { errorMessage, studentRequest } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageIntro, PortalCard, PortalEmptyState } from './portal-ui';

const TONE = {
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
} as const;

const outlineButton =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-navy-950 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50';

function feeDescription(app: StudentReExamApplication): string {
  const fee = app.fee;
  if (fee.status === 'ASSESSED' && fee.amountMinor !== null && fee.currency) {
    return `${formatMoney(fee.amountMinor, fee.currency)}${fee.scope ? ` · ${RE_EXAM_FEE_SCOPE_LABELS[fee.scope]}` : ''}`;
  }
  return fee.blockedReason
    ? RE_EXAM_FEE_BLOCKED_MESSAGES[fee.blockedReason]
    : 'Fee not configured.';
}

function ApplicationCard({ app }: { app: StudentReExamApplication }) {
  const router = useRouter();
  const [pending, setPending] = useState<'cancel' | 'fee' | null>(null);
  const run = async (action: 'cancel' | 'fee') => {
    setPending(action);
    try {
      await studentRequest(
        'POST',
        `student/re-exam-applications/${app.id}/${action === 'cancel' ? 'cancel' : 'fee'}`,
        studentReExamApplicationSchema,
      );
      toast.success(action === 'cancel' ? 'Application cancelled.' : 'Fee checked again.');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  };
  return (
    <article
      aria-label={`Application ${app.reference}`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold break-words text-navy-950">
            {app.subject.code} — {app.subject.name}
          </h2>
          <p className="text-meta">
            <span className="tabular">{app.reference}</span> · {app.examinationName} ·{' '}
            {app.periodLabel}
          </p>
        </div>
        <StatusBadge tone={TONE[app.status]}>{RE_EXAM_STATUS_LABELS[app.status]}</StatusBadge>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Registration</dt>
          <dd className="font-medium break-words text-navy-950">
            {app.registrationNumber} · {app.programName}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Re-exam attempt</dt>
          <dd className="font-medium text-navy-950">{app.attemptNumber}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fee</dt>
          <dd className="font-medium break-words text-navy-950">{feeDescription(app)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Submitted</dt>
          <dd className="font-medium text-navy-950">{formatDateTime(app.submittedAt)}</dd>
        </div>
        {app.decisionReason && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              {app.status === 'REJECTED'
                ? 'Reason given by the university'
                : 'Note from the university'}
            </dt>
            <dd className="font-medium break-words text-navy-950">{app.decisionReason}</dd>
          </div>
        )}
      </dl>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-navy-950">History</h3>
        <ol className="flex flex-col gap-1 text-sm">
          {app.history.map((item, index) => (
            <li
              key={`${item.createdAt}-${String(index)}`}
              className="flex flex-wrap justify-between gap-2"
            >
              <span className="text-navy-950">{item.summary}</span>
              <span className="text-meta">{formatDateTime(item.createdAt)}</span>
            </li>
          ))}
        </ol>
      </div>
      {app.status === 'SUBMITTED' && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {app.fee.status === 'NOT_CONFIGURED' && (
            <button
              type="button"
              className={outlineButton}
              disabled={pending !== null}
              onClick={() => void run('fee')}
            >
              {pending === 'fee' ? 'Checking…' : 'Check the fee again'}
            </button>
          )}
          <button
            type="button"
            className={outlineButton}
            disabled={pending !== null}
            onClick={() => void run('cancel')}
          >
            {pending === 'cancel' ? 'Cancelling…' : 'Cancel application'}
          </button>
        </div>
      )}
    </article>
  );
}

export function StudentReExamApplications({
  applications,
}: {
  applications: StudentReExamApplication[] | null;
}) {
  return (
    <>
      <PageIntro
        title="My re-exam applications"
        description="Your applications with their fee, decision and history. Only you and authorised university staff can see them."
      />
      {applications === null ? (
        <PortalCard title="Applications" icon={ClipboardListIcon}>
          <p role="alert" className="text-sm text-danger-text">
            Your applications could not be loaded right now. Refresh the page to try again.
          </p>
        </PortalCard>
      ) : applications.length === 0 ? (
        <PortalCard title="Applications" icon={ClipboardListIcon}>
          <PortalEmptyState
            icon={ClipboardListIcon}
            title="No re-exam applications yet"
            description="When you apply for a re-examination, it appears here with its fee and the university’s decision."
          >
            <Link
              href="/student/examinations/re-exam"
              className="text-sm font-medium text-brand underline underline-offset-2"
            >
              Apply for a re-examination
            </Link>
          </PortalEmptyState>
        </PortalCard>
      ) : (
        <div className="flex flex-col gap-4">
          {applications.map((app) => (
            <ApplicationCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </>
  );
}
