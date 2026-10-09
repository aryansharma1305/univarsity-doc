'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { Label } from '@docversity/ui/components/label';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { Textarea } from '@docversity/ui/components/textarea';
import Link from 'next/link';
import {
  formatMoney,
  PAYMENT_REGION_LABELS,
  RE_EXAM_ATTEMPT_BASIS_LABEL,
  RE_EXAM_PAYMENT_STATUS_LABELS,
  type ReExamApplicationDetail,
} from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { ErrorState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { reExamsApi, useReExamApplication, useReExamMutation } from './api';
import { ApplicationStatusBadge } from './applications-view';
import { feeText } from './labels';

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd className={`text-sm break-words text-navy-950 ${mono ? 'font-mono text-xs' : ''}`}>
        {value && value !== '' ? value : '—'}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0 shadow-card">
      <CardContent className="flex flex-col gap-4 p-5">
        <h2 className="text-section-title text-navy-950">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function DecisionDialog({
  app,
  kind,
  onClose,
}: {
  app: ReExamApplicationDetail;
  kind: 'approve' | 'reject';
  onClose: () => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const mutation = useReExamMutation(() =>
    kind === 'approve'
      ? reExamsApi.approve(app.id, { note: text.trim() || null })
      : reExamsApi.reject(app.id, { reason: text.trim() }),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === 'approve'
              ? 'Approve this re-exam application?'
              : 'Reject this re-exam application?'}
          </DialogTitle>
          <DialogDescription>
            {app.student.name} ({app.registrationNumber}) · {app.subject.code} {app.subject.name} ·
            attempt {app.attemptNumber}.{' '}
            {kind === 'approve'
              ? 'Approval is a separate decision from payment; check the payment state if your policy requires it.'
              : 'The reason is shown to the student.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{kind === 'approve' ? 'Note (optional)' : 'Reason'}</Label>
          <Textarea
            id={id}
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </div>
        {mutation.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={kind === 'reject' ? 'destructive' : 'default'}
            disabled={mutation.isPending || (kind === 'reject' && text.trim().length < 5)}
            onClick={() => {
              mutation.mutate(undefined, {
                onSuccess: () => {
                  toast.success(
                    kind === 'approve' ? 'Application approved.' : 'Application rejected.',
                  );
                  onClose();
                },
              });
            }}
          >
            {mutation.isPending ? 'Working…' : kind === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReExamApplicationDetailView({ applicationId }: { applicationId: string }) {
  const query = useReExamApplication(applicationId);
  const canDecide = useCan(PERMISSIONS.reExamApplicationsDecide);
  const canSeePayments = useCan(PERMISSIONS.reExamPaymentsRead);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  useSetBreadcrumbLabel(query.data ? query.data.reference : null);

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const app = query.data;

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-meta">
              Re-exam application · <span className="tabular">{app.reference}</span>
            </p>
            <h1 className="text-page-title break-words text-navy-950">{app.student.name}</h1>
            <p className="mt-1 text-sm break-words">
              <span className="tabular">{app.registrationNumber}</span> · {app.program.code} —{' '}
              {app.program.name}
            </p>
            <div className="mt-2">
              <ApplicationStatusBadge status={app.status} />
            </div>
          </div>
          {canDecide && app.status === 'SUBMITTED' && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDialog('reject');
                }}
              >
                <XIcon aria-hidden="true" />
                Reject
              </Button>
              <Button
                onClick={() => {
                  setDialog('approve');
                }}
              >
                <CheckIcon aria-hidden="true" />
                Approve
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Examination and subject">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="Examination" value={app.examination.name} />
            <Row label="Examination session" value={app.examination.examSession} />
            <Row label="Semester / year" value={app.periodLabel} />
            <Row label="Academic session (batch)" value={app.academicSessionName} />
            <Row label="Subject" value={`${app.subject.code} — ${app.subject.name}`} />
            <Row label="Submitted" value={formatDateTime(app.submittedAt)} />
          </dl>
        </Section>
        <Section title="Attempt and fee (recorded by the system)">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="Re-exam attempt" value={String(app.attemptNumber)} />
            <Row label="Attempt basis" value={RE_EXAM_ATTEMPT_BASIS_LABEL} />
            <Row label="Fee" value={feeText(app.fee)} />
            <Row
              label="Fee rule version"
              value={app.fee.ruleVersion !== null ? `Version ${String(app.fee.ruleVersion)}` : null}
            />
            <Row
              label="Fee assessed"
              value={app.fee.assessedAt ? formatDateTime(app.fee.assessedAt) : null}
            />
          </dl>
          <p className="text-xs text-foreground/80">
            The amount and rule version are fixed on the application; later fee changes do not alter
            it.
          </p>
        </Section>
      </div>

      <Section title="Decision">
        <dl className="grid gap-3 sm:grid-cols-3">
          <Row
            label="Decided"
            value={
              app.decidedAt
                ? `${formatDateTime(app.decidedAt)}${app.decidedBy ? ` by ${app.decidedBy.displayName}` : ''}`
                : app.cancelledAt
                  ? `Cancelled by the student ${formatDateTime(app.cancelledAt)}`
                  : 'Awaiting decision'
            }
          />
          <Row label="Reason / note" value={app.decisionReason} />
        </dl>
      </Section>

      <Section title="Payment (separate from the decision)">
        {app.payment ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Row label="Payment status" value={RE_EXAM_PAYMENT_STATUS_LABELS[app.payment.status]} />
            <Row
              label="Amount due"
              value={`${formatMoney(app.payment.amountMinor, app.payment.currency)} · ${PAYMENT_REGION_LABELS[app.payment.region]}`}
            />
            <Row
              label="Submitted"
              value={app.payment.submittedAt ? formatDateTime(app.payment.submittedAt) : null}
            />
          </dl>
        ) : (
          <p className="text-sm text-foreground/80">The student has not started a payment.</p>
        )}
        <p className="text-xs text-foreground/80">
          Payments are verified separately by authorised staff. Verification never approves the
          application, and approving it never marks it paid.
        </p>
        {app.payment && canSeePayments && (
          <Link
            href={`/admin/re-exam-payments/${app.payment.id}`}
            className="text-sm font-medium text-brand hover:underline"
          >
            Open payment
          </Link>
        )}
      </Section>

      <Section title="History">
        <ol className="divide-y divide-border rounded-lg border border-border">
          {app.history.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4"
            >
              <span className="text-sm text-navy-950">{item.summary}</span>
              <span className="text-meta shrink-0">
                {item.actor ?? 'System'} · {formatDateTime(item.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {dialog && (
        <DecisionDialog
          app={app}
          kind={dialog}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
