'use client';

import Link from 'next/link';
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
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  formatMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_REGION_LABELS,
  type ReExamPaymentDetail,
} from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { ErrorState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ApplicationStatusBadge } from '@/features/re-exams/applications-view';
import { evidenceUrl, paymentsApi, usePayment, usePaymentMutation } from './api';
import { minorToMajor } from './destination-form';
import { PAYMENT_STATUS } from './labels';
import { PaymentStatusBadge } from './payments-view';

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd
        className={`text-sm break-words text-navy-950 ${mono ? 'font-mono text-xs break-all' : ''}`}
      >
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

function VerifyDialog({ payment, onClose }: { payment: ReExamPaymentDetail; onClose: () => void }) {
  const amountId = useId();
  const currencyId = useId();
  const noteId = useId();
  const checkId = useId();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(payment.currency);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const verify = usePaymentMutation(() =>
    paymentsApi.verify(payment.id, {
      verifiedAmount: amount.trim(),
      verifiedCurrency: currency.trim().toUpperCase(),
      confirmedAgainstUniversityAccount: true,
      note: note.trim() || null,
    }),
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
          <DialogTitle>Verify this payment?</DialogTitle>
          <DialogDescription>
            Amount due: {formatMoney(payment.amountMinor, payment.currency)}. Enter what the
            university actually received according to its own account or reconciliation records —
            not what the student’s receipt says.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={amountId}>Amount received</Label>
            <Input
              id={amountId}
              inputMode="decimal"
              placeholder={minorToMajor(payment.amountMinor, payment.currency)}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={currencyId}>Currency</Label>
            <Input
              id={currencyId}
              maxLength={3}
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>Reconciliation note (optional)</Label>
          <Textarea
            id={noteId}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </div>
        <div className="flex items-start gap-2">
          <input
            id={checkId}
            type="checkbox"
            className="mt-1 size-4"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
            }}
          />
          <Label htmlFor={checkId} className="font-normal">
            I checked the university’s payment account or reconciliation records and the funds were
            received.
          </Label>
        </div>
        {verify.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(verify.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!confirmed || amount.trim() === '' || verify.isPending}
            onClick={() => {
              verify.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Payment verified.');
                  onClose();
                },
              });
            }}
          >
            {verify.isPending ? 'Verifying…' : 'Verify payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ payment, onClose }: { payment: ReExamPaymentDetail; onClose: () => void }) {
  const id = useId();
  const [reason, setReason] = useState('');
  const reject = usePaymentMutation(() =>
    paymentsApi.reject(payment.id, { reason: reason.trim() }),
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
          <DialogTitle>Reject this payment?</DialogTitle>
          <DialogDescription>
            The reason is shown to the student, who can then pay again. The re-exam application
            itself is not changed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Reason</Label>
          <Textarea
            id={id}
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </div>
        {reject.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(reject.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 5 || reject.isPending}
            onClick={() => {
              reject.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Payment rejected.');
                  onClose();
                },
              });
            }}
          >
            {reject.isPending ? 'Working…' : 'Reject payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReExamPaymentDetailView({ paymentId }: { paymentId: string }) {
  const query = usePayment(paymentId);
  const canVerify = useCan(PERMISSIONS.reExamPaymentsVerify);
  const canSeeApplications = useCan(PERMISSIONS.reExamApplicationsRead);
  const [dialog, setDialog] = useState<'verify' | 'reject' | null>(null);
  useSetBreadcrumbLabel(query.data ? query.data.application.reference : null);

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const p = query.data;

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-meta">
              Re-exam payment · application{' '}
              <span className="tabular">{p.application.reference}</span>
            </p>
            <h1 className="text-page-title break-words text-navy-950">{p.student.name}</h1>
            <p className="mt-1 text-sm">
              <span className="tabular">{p.registrationNumber}</span> · {p.programName}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <PaymentStatusBadge status={p.status} />
            </div>
          </div>
          {canVerify && p.status === 'SUBMITTED' && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDialog('reject');
                }}
              >
                Reject
              </Button>
              <Button
                onClick={() => {
                  setDialog('verify');
                }}
              >
                Verify payment
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {p.status === 'SUBMITTED' && (
        <p
          role="note"
          className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-navy-950"
        >
          Not yet verified. A transaction reference or screenshot does not prove the university
          received the money — confirm it in the university’s own account first.
        </p>
      )}
      {p.sameReference.length > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm text-navy-950"
        >
          The same transaction reference was also used for:{' '}
          {p.sameReference
            .map((s) => `application ${s.applicationReference} (${PAYMENT_STATUS[s.status].label})`)
            .join('; ')}
          .
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Amount due (fixed when the student chose)">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="Amount" value={formatMoney(p.amountMinor, p.currency)} />
            <Row
              label="Source"
              value={
                p.amountSource === 'FEE_RULE'
                  ? `Re-exam fee rule version ${String(p.feeRuleVersion)}`
                  : `Approved ${p.currency} amount of the payment details (fee rule version ${String(p.feeRuleVersion)})`
              }
            />
            <Row
              label="Country / region"
              value={`${PAYMENT_REGION_LABELS[p.region]}${p.destination.countryName ? ` — ${p.destination.countryName}` : ''}`}
            />
            <Row
              label="Paid to"
              value={`${p.destination.beneficiaryName} · ${PAYMENT_METHOD_LABELS[p.destination.method]} (version ${String(p.destination.version)})`}
            />
          </dl>
        </Section>
        <Section title="Application">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="Subject" value={`${p.subject.code} — ${p.subject.name}`} />
            <Row label="Re-exam attempt" value={String(p.application.attemptNumber)} />
            <Row label="Examination" value={`${p.examinationName} · ${p.periodLabel}`} />
            <Row label="Batch" value={p.academicSessionName} />
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta">Academic decision (separate):</span>
            <ApplicationStatusBadge status={p.application.status} />
            {canSeeApplications && (
              <Link
                href={`/admin/re-exam-applications/${p.application.id}`}
                className="text-sm font-medium text-brand hover:underline"
              >
                Open application
              </Link>
            )}
          </div>
        </Section>
      </div>

      <Section title="Submitted by the student">
        <dl className="grid gap-3 sm:grid-cols-3">
          <Row label="Transaction reference" value={p.transactionReference} mono />
          <Row label="Submitted" value={p.submittedAt ? formatDateTime(p.submittedAt) : null} />
          <Row
            label="Evidence"
            value={
              p.evidence
                ? `${p.evidence.contentType} · ${String(Math.ceil(p.evidence.sizeBytes / 1024))} KB`
                : 'None attached'
            }
          />
        </dl>
        {p.evidence && (
          <a
            href={evidenceUrl(p.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand hover:underline"
          >
            Open evidence (viewing is recorded)
          </a>
        )}
      </Section>

      <Section title="Review">
        <dl className="grid gap-3 sm:grid-cols-3">
          <Row
            label="Reviewed"
            value={
              p.reviewedAt
                ? `${formatDateTime(p.reviewedAt)}${p.reviewedBy ? ` by ${p.reviewedBy.displayName}` : ''}`
                : 'Not reviewed'
            }
          />
          <Row
            label="Amount received"
            value={
              p.verifiedAmountMinor !== null && p.verifiedCurrency
                ? formatMoney(p.verifiedAmountMinor, p.verifiedCurrency)
                : null
            }
          />
          <Row label="Reason / note" value={p.rejectionReason ?? p.reviewNote} />
        </dl>
      </Section>

      <Section title="History">
        <ol className="divide-y divide-border rounded-lg border border-border">
          {p.history.map((item) => (
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
        {p.otherPayments.length > 0 && (
          <p className="text-meta">
            Other payments of this application:{' '}
            {p.otherPayments.map((o, index) => (
              <span key={o.id}>
                {index > 0 ? ', ' : ''}
                <Link
                  href={`/admin/re-exam-payments/${o.id}`}
                  className="text-brand hover:underline"
                >
                  {PAYMENT_STATUS[o.status].label} ({formatDateTime(o.createdAt)})
                </Link>
              </span>
            ))}
          </p>
        )}
      </Section>
      {dialog === 'verify' && (
        <VerifyDialog
          payment={p}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'reject' && (
        <RejectDialog
          payment={p}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
