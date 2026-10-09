'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { CreditCardIcon, HistoryIcon, ShieldAlertIcon, WalletIcon } from 'lucide-react';
import { StatusBadge } from '@docversity/ui';
import {
  formatMoney,
  PAYMENT_EVIDENCE_RULES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_REGION_LABELS,
  PAYMENT_REGION_UNAVAILABLE_MESSAGES,
  type PaymentRegion,
  RE_EXAM_ATTEMPT_BASIS_LABEL,
  RE_EXAM_FEE_SCOPE_LABELS,
  RE_EXAM_PAYMENT_STATUS_LABELS,
  type StudentReExamPayment,
  type StudentReExamPaymentView,
  studentReExamPaymentViewSchema,
} from '@docversity/validation';
import { apiUpload, errorMessage, studentRequest } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { DetailList, PageIntro, PortalCard } from './portal-ui';

const TONE = {
  AWAITING_PAYMENT: 'neutral',
  SUBMITTED: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
  VOID: 'neutral',
} as const;

const primaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50';

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];
function attemptLabel(n: number): string {
  return `Re-exam attempt ${String(n)}${ORDINAL[n - 1] ? ` (${ORDINAL[n - 1] ?? ''} re-exam)` : ''}`;
}

function SafetyNote() {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-navy-950"
    >
      <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" />
      <div className="flex flex-col gap-1">
        <p>
          Docversity does not take payments. You pay with your own bank or payment app using the
          university’s details below, then enter the transaction reference here.
        </p>
        <p>
          Never share a PIN, one-time code (OTP), password or card security code — the university
          will never ask for them. QR codes from one country may not work with apps from another:
          choose the country or region you are paying from.
        </p>
      </div>
    </div>
  );
}

function RegionChooser({ view }: { view: StudentReExamPaymentView }) {
  const router = useRouter();
  const legendId = useId();
  const [region, setRegion] = useState<PaymentRegion | ''>(view.current?.region ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choose = async () => {
    if (!region) return;
    setPending(true);
    setError(null);
    try {
      await studentRequest(
        'POST',
        `student/re-exam-applications/${view.application.id}/payment`,
        studentReExamPaymentViewSchema,
        { body: { region } },
      );
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <fieldset aria-labelledby={legendId} className="flex flex-col gap-3">
      <legend id={legendId} className="text-sm font-medium text-navy-950">
        Where are you paying from?
      </legend>
      <ul className="grid list-none gap-2 sm:grid-cols-2">
        {view.regions.map((option) => {
          const inputId = `region-${option.region}`;
          return (
            <li key={option.region}>
              <label
                htmlFor={inputId}
                className={`flex h-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                  region === option.region ? 'border-brand bg-secondary' : 'border-border'
                } ${option.available ? '' : 'cursor-not-allowed opacity-80'}`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="region"
                  value={option.region}
                  className="mt-1 size-4"
                  disabled={!option.available}
                  checked={region === option.region}
                  onChange={() => {
                    setRegion(option.region);
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-navy-950">
                    {option.label}
                    {option.isGroup ? ' (region)' : ''}
                  </span>
                  {option.unavailableReason && (
                    <span className="text-muted-foreground">
                      {PAYMENT_REGION_UNAVAILABLE_MESSAGES[option.unavailableReason]}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`${primaryButton} self-start`}
        disabled={!region || pending || region === view.current?.region}
        onClick={() => void choose()}
      >
        {pending
          ? 'Loading…'
          : view.current
            ? 'Use this country/region instead'
            : 'Show payment details'}
      </button>
    </fieldset>
  );
}

function SubmitForm({ payment }: { payment: StudentReExamPayment }) {
  const router = useRouter();
  const refId = useId();
  const fileId = useId();
  const hintId = useId();
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const required = payment.destination.evidenceRequirement === 'REQUIRED';
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setPending(true);
          setError(null);
          try {
            const form = new FormData();
            form.append('transactionReference', reference.trim());
            if (file) form.append('evidence', file);
            await apiUpload(
              `student/re-exam-payments/${payment.id}/submit`,
              form,
              studentReExamPaymentViewSchema,
              { principal: 'student' },
            );
            toast.success('Submitted. The university will verify your payment.');
            router.refresh();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setPending(false);
          }
        })();
      }}
    >
      <h3 className="text-sm font-semibold text-navy-950">After you have paid</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={refId} className="text-sm font-medium text-navy-950">
          Transaction reference (UTR / transaction ID)
        </label>
        <input
          id={refId}
          aria-describedby={hintId}
          autoComplete="off"
          maxLength={64}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          value={reference}
          onChange={(event) => {
            setReference(event.target.value);
          }}
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          Copy it from your payment confirmation. Not your PIN, OTP or password.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fileId} className="text-sm font-medium text-navy-950">
          Payment receipt or screenshot ({required ? 'required' : 'optional'}; PDF, JPEG or PNG, up
          to {PAYMENT_EVIDENCE_RULES.maxBytes / (1024 * 1024)} MB)
        </label>
        <input
          id={fileId}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="text-sm"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <button
        type="submit"
        className={`${primaryButton} self-start`}
        disabled={pending || reference.trim().length < 6 || (required && !file)}
      >
        {pending ? 'Submitting…' : 'Submit payment details'}
      </button>
    </form>
  );
}

function CurrentPayment({ payment }: { payment: StudentReExamPayment }) {
  const amount = formatMoney(payment.amountMinor, payment.currency);
  return (
    <PortalCard title="Your payment" icon={WalletIcon}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={TONE[payment.status]}>
            {RE_EXAM_PAYMENT_STATUS_LABELS[payment.status]}
          </StatusBadge>
          <span className="text-sm text-muted-foreground">
            {PAYMENT_REGION_LABELS[payment.region]}
            {payment.destination.countryName ? ` — ${payment.destination.countryName}` : ''}
          </span>
        </div>
        <DetailList
          columns={2}
          items={[
            { label: 'Amount to pay', value: amount },
            { label: 'Pay to', value: payment.destination.beneficiaryName },
            { label: 'Method', value: PAYMENT_METHOD_LABELS[payment.destination.method] },
            {
              label: 'Transaction reference',
              value: payment.transactionReference,
              missing: 'Not submitted yet',
            },
          ]}
        />
        {payment.status === 'AWAITING_PAYMENT' &&
          (payment.destination.available ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, ownership-checked image */}
              <img
                src={`/api/v1/student/re-exam-payments/${payment.id}/qr`}
                alt={`University payment QR code for ${PAYMENT_REGION_LABELS[payment.region]} (${amount})`}
                className="w-full max-w-56 self-center rounded-md border border-border bg-white sm:self-start"
              />
              <div className="flex min-w-0 flex-col gap-2 text-sm">
                <h3 className="font-semibold text-navy-950">How to pay</h3>
                <p className="break-words whitespace-pre-line text-navy-950">
                  {payment.destination.instructions}
                </p>
                <p className="text-muted-foreground">
                  Pay exactly {amount}. Docversity cannot see whether a payment arrived; the
                  university checks it.
                </p>
              </div>
            </div>
          ) : (
            <p role="alert" className="text-sm text-danger-text">
              These payment details are no longer offered. If you have not paid yet, choose your
              country or region again. If you already paid with them, enter your transaction
              reference below.
            </p>
          ))}
        {payment.status === 'AWAITING_PAYMENT' && <SubmitForm payment={payment} />}
        {payment.status === 'SUBMITTED' && (
          <p className="text-sm text-navy-950">
            Submitted {payment.submittedAt ? formatDateTime(payment.submittedAt) : ''}. The
            university will check its account and update the status here. It is not verified yet.
          </p>
        )}
        {payment.status === 'VERIFIED' && (
          <p className="text-sm text-navy-950">
            The university confirmed it received your payment
            {payment.reviewedAt ? ` on ${formatDateTime(payment.reviewedAt)}` : ''}. Your re-exam
            application is decided separately.
          </p>
        )}
      </div>
    </PortalCard>
  );
}

export function StudentReExamPaymentPage({ view }: { view: StudentReExamPaymentView | null }) {
  if (view === null) {
    return (
      <>
        <PageIntro
          title="Pay the re-exam fee"
          description="Payment for one of your applications."
        />
        <PortalCard title="Payment" icon={CreditCardIcon}>
          <p role="alert" className="text-sm text-danger-text">
            This payment page could not be loaded. It may not belong to your account, or the service
            is unavailable. Go back to{' '}
            <Link href="/student/examinations/re-exam/applications" className="underline">
              your applications
            </Link>
            .
          </p>
        </PortalCard>
      </>
    );
  }
  const { application: app, fee, current } = view;
  const canChoose =
    view.unavailableReason === null && (!current || current.status === 'AWAITING_PAYMENT');
  return (
    <>
      <PageIntro
        title="Pay the re-exam fee"
        description={`Application ${app.reference} · ${app.subject.code} ${app.subject.name}`}
      />
      <div className="flex flex-col gap-5">
        <PortalCard title="Application" icon={CreditCardIcon}>
          <DetailList
            columns={2}
            items={[
              { label: 'Student', value: app.studentName },
              { label: 'Registration number', value: app.registrationNumber },
              { label: 'Course', value: app.programName },
              { label: 'Admission batch', value: app.academicSessionName },
              { label: 'Examination', value: `${app.examinationName} · ${app.examSession}` },
              { label: 'Semester / year', value: app.periodLabel },
              { label: 'Subject', value: `${app.subject.code} — ${app.subject.name}` },
              { label: 'Application reference', value: app.reference },
              { label: 'Attempt', value: attemptLabel(app.attemptNumber) },
              {
                label: 'Re-exam fee',
                value:
                  fee.status === 'ASSESSED' && fee.amountMinor !== null && fee.currency
                    ? `${formatMoney(fee.amountMinor, fee.currency)}${fee.scope ? ` · ${RE_EXAM_FEE_SCOPE_LABELS[fee.scope]}` : ''}`
                    : null,
                missing: 'No approved fee',
              },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Recorded by the university system: {RE_EXAM_ATTEMPT_BASIS_LABEL.toLowerCase()} are
            counted. You cannot change the attempt or the fee.
          </p>
        </PortalCard>

        {view.unavailableReason ? (
          <PortalCard title="Payment" icon={WalletIcon}>
            <p role="alert" className="text-sm text-navy-950">
              {view.unavailableReason}
            </p>
          </PortalCard>
        ) : (
          <>
            <SafetyNote />
            {current && <CurrentPayment payment={current} />}
            {canChoose && (
              <PortalCard
                title={current ? 'Change country or region' : 'Choose how to pay'}
                icon={WalletIcon}
              >
                <RegionChooser view={view} />
              </PortalCard>
            )}
          </>
        )}

        {view.previous.length > 0 && (
          <PortalCard title="Earlier payments" icon={HistoryIcon}>
            <ul className="flex flex-col gap-3 text-sm">
              {view.previous.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-1 border-b border-border pb-3 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={TONE[p.status]}>
                      {RE_EXAM_PAYMENT_STATUS_LABELS[p.status]}
                    </StatusBadge>
                    <span className="text-muted-foreground">
                      {PAYMENT_REGION_LABELS[p.region]} · {formatMoney(p.amountMinor, p.currency)} ·{' '}
                      {formatDateTime(p.createdAt)}
                    </span>
                  </div>
                  {p.rejectionReason && (
                    <p className="text-navy-950">Reason from the university: {p.rejectionReason}</p>
                  )}
                </li>
              ))}
            </ul>
          </PortalCard>
        )}
        <p className="text-xs text-muted-foreground">{view.retention}</p>
      </div>
    </>
  );
}
