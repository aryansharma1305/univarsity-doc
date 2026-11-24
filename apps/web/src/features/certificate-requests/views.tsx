'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { PaymentButtonPanel } from '@/features/payments/payment-button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileBadgeIcon, ArrowRightIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@docversity/ui/components/dialog';
import {
  type CertificateRequestDetail,
  type CertificateType,
  certificateTypeSchema,
  certificateRequestStatusSchema,
} from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { Pagination } from '@/components/data/pagination';
import { FilterSelect } from '@/components/data/filter-select';
import { useCan } from '@/components/providers/session-context';
import { useListParams } from '@/hooks/use-list-params';
import { formatDateTime } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { certificateRequestsApi as api } from './api';
const titles: Record<string, string> = {
  TRANSCRIPT: 'Transcript',
  PROVISIONAL: 'Provisional certificate',
  CHARACTER: 'Character certificate',
  MIGRATION: 'Migration certificate',
  COURSE_COMPLETION: 'Course completion certificate',
};
const labels: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  INFORMATION_REQUESTED: 'Information requested',
  INFORMATION_PROVIDED: 'Information provided',
  REVIEW_COMPLETED: 'Staff review completed',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
};
const actions: Record<string, string> = {
  SUBMIT: 'Application submitted',
  REQUEST_INFORMATION: 'Additional information requested',
  RECORD_REVIEW: 'Internal review recorded',
  RESPOND: 'Student response received',
  COMPLETE_REVIEW: 'Staff review completed',
  CANCEL: 'Application cancelled',
  CLOSE: 'Application closed',
};
function Badge({ status }: { status: string }) {
  return (
    <StatusBadge tone={status === 'INFORMATION_REQUESTED' ? 'warning' : 'neutral'}>
      {labels[status]}
    </StatusBadge>
  );
}
function ApplicationForm({ type, onDone }: { type: CertificateType; onDone: () => void }) {
  const catalogue = useQuery({ queryKey: ['certificate-services'], queryFn: api.catalogue });
  const service = catalogue.data?.data.find((s) => s.certificateType === type);
  const [purpose, setPurpose] = useState(''),
    [remarks, setRemarks] = useState(''),
    [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  async function submit() {
    setPending(true);
    setError(null);
    try {
      await api.submit({
        certificateType: type,
        submissionKey,
        purpose,
        ...(remarks ? { remarks } : {}),
      });
      await client.invalidateQueries({ queryKey: ['certificate-requests'] });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  if (!service?.available) return null;
  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="application-heading">
      <h2 id="application-heading" className="text-xl font-semibold">
        Request {titles[type]}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This application uses your signed-in student identity.
      </p>
      {confirm ? (
        <>
          <dl className="mt-5 space-y-3">
            <div>
              <dt className="font-medium">Purpose</dt>
              <dd className="whitespace-pre-wrap break-words">{purpose || 'Not supplied'}</dd>
            </div>
            {remarks && (
              <div>
                <dt className="font-medium">Remarks</dt>
                <dd className="whitespace-pre-wrap break-words">{remarks}</dd>
              </div>
            )}
          </dl>
          <p className="my-4 text-sm">
            Submitting an application does not approve or issue a certificate.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={pending} onClick={() => void submit()}>
              {pending ? 'Submitting…' : 'Submit application'}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setConfirm(false);
              }}
            >
              Edit information
            </Button>
          </div>
        </>
      ) : (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm(true);
          }}
        >
          <div>
            <label htmlFor="purpose" className="text-sm font-medium">
              Purpose {service.purposeRequired ? '(required)' : '(optional)'}
            </label>
            <Textarea
              id="purpose"
              required={service.purposeRequired}
              maxLength={1000}
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
              }}
            />
          </div>
          {service.remarksAllowed && (
            <div>
              <label htmlFor="remarks" className="text-sm font-medium">
                Remarks (optional)
              </label>
              <Textarea
                id="remarks"
                maxLength={2000}
                value={remarks}
                onChange={(e) => {
                  setRemarks(e.target.value);
                }}
              />
            </div>
          )}
          <Button type="submit">Review application</Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button variant="ghost" className="mt-3" disabled={pending} onClick={onDone}>
        Close application form
      </Button>
    </section>
  );
}
function RequestsView({
  student = false,
  canRead = true,
}: {
  student?: boolean;
  canRead?: boolean;
}) {
  const { values, page, update } = useListParams(['status', 'certificateType'] as const);
  const status = certificateRequestStatusSchema.safeParse(values.status),
    type = certificateTypeSchema.safeParse(values.certificateType);
  const query = useQuery({
    queryKey: ['certificate-requests', student, page, values],
    queryFn: () =>
      api.list(student, {
        page,
        pageSize: 20,
        ...(!student && values.search ? { search: values.search } : {}),
        ...(status.success ? { status: status.data } : {}),
        ...(type.success ? { certificateType: type.data } : {}),
      }),
    enabled: student || canRead,
  });
  if (!student && !canRead) return <ForbiddenState />;
  return (
    <div className="space-y-6 sm:space-y-8">
      {!student && (
        <PageHeader
          title="Certificate requests"
          description="Review applications and request information. Staff review does not authorize certificate issuance."
        />
      )}
      <section aria-labelledby="requests-heading">
        <h2 id="requests-heading" className="mb-4 text-lg font-semibold">
          {student ? 'Certificate requests' : 'Request queue'}
        </h2>
        {!student && (
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              aria-label="Search requests"
              placeholder="Reference, student or registration"
              value={values.search}
              onChange={(e) => {
                update({ search: e.target.value });
              }}
              className="sm:max-w-xs"
            />
            <FilterSelect
              label="Certificate type"
              allLabel="All certificate types"
              value={values.certificateType}
              options={certificateTypeSchema.options.map((value) => ({
                value,
                label: titles[value] ?? value,
              }))}
              onChange={(certificateType) => {
                update({ certificateType });
              }}
            />
            <FilterSelect
              label="Request status"
              allLabel="All statuses"
              value={values.status}
              options={certificateRequestStatusSchema.options.map((value) => ({
                value,
                label: labels[value] ?? value,
              }))}
              onChange={(status) => {
                update({ status });
              }}
            />
          </div>
        )}
        {query.isPending ? (
          <TableSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            {!student && (
              <p className="mb-4 text-sm text-muted-foreground tabular-nums">
                {query.data.meta.total} matching requests ·{' '}
                {query.data.counts.INFORMATION_REQUESTED} awaiting information across the queue
              </p>
            )}
            {query.data.data.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 sm:p-8">
                <h3 className="font-semibold">
                  {student ? 'No applications yet' : 'No matching requests'}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {student
                    ? 'Certificate requests you submit will appear here.'
                    : 'Try another filter, or return when students have submitted applications.'}
                </p>
              </div>
            ) : (
              <div className="divide-y rounded-xl border bg-card">
                {query.data.data.map((r) => (
                  <article key={r.id} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          <Link
                            href={
                              student
                                ? `/student/certificate-requests/${r.id}`
                                : `/admin/certificate-requests/${r.id}`
                            }
                            className="text-brand underline-offset-4 hover:underline"
                          >
                            {titles[r.certificateType]}
                          </Link>
                        </h3>
                        {r.student && (
                          <p className="mt-1 text-sm">
                            {r.student.name} · {r.student.registrations.join(', ')}
                          </p>
                        )}
                        <p className="mt-2 break-all text-xs text-muted-foreground">
                          {r.reference}
                        </p>
                      </div>
                      <Badge status={r.status} />
                    </div>
                    <p className="mt-3 text-sm">{r.nextAction}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Submitted {formatDateTime(r.submittedAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
            <Pagination
              meta={query.data.meta}
              onPageChange={(page) => {
                update({ page: String(page) });
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
function RequestAction({
  r,
  student,
  action,
  label,
}: {
  r: CertificateRequestDetail;
  student: boolean;
  action: string;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(''),
    [privateNote, setNote] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const note = action === 'record-review',
    needsMessage = action === 'request-information' || action === 'respond';
  async function submit() {
    setPending(true);
    setError(null);
    try {
      await api.action(student, r.id, action, {
        version: r.version,
        ...(needsMessage ? { message } : {}),
        ...(!student && privateNote ? { privateNote } : {}),
      });
      await client.invalidateQueries({ queryKey: ['certificate-requests'] });
      setOpen(false);
      setMessage('');
      setNote('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!pending) {
            setOpen(v);
            setError(null);
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {note
                ? 'This note is private to authorized staff.'
                : 'This action updates the application history. It does not approve or issue a certificate.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4"
          >
            {needsMessage && (
              <div>
                <label htmlFor={`message-${action}`} className="text-sm font-medium">
                  {student ? 'Your response' : 'Information requested (visible to student)'}
                </label>
                <Textarea
                  id={`message-${action}`}
                  required
                  maxLength={2000}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                  }}
                />
              </div>
            )}
            {!student && ['record-review', 'request-information'].includes(action) && (
              <div>
                <label htmlFor={`note-${action}`} className="text-sm font-medium">
                  Private staff note {note ? '(required)' : '(optional)'}
                </label>
                <Textarea
                  id={`note-${action}`}
                  required={note}
                  maxLength={2000}
                  value={privateNote}
                  onChange={(e) => {
                    setNote(e.target.value);
                  }}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Back
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
function RequestDetailView({
  id,
  student = false,
  canRead = true,
  canReview = false,
}: {
  id: string;
  student?: boolean;
  canRead?: boolean;
  canReview?: boolean;
}) {
  const query = useQuery({
    queryKey: ['certificate-requests', student, id],
    queryFn: () => api.detail(student, id),
    enabled: student || canRead,
  });
  if (!student && !canRead) return <ForbiddenState />;
  if (query.isPending) return <TableSkeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const r = query.data;
  return (
    <div className="space-y-6">
      <Link
        href={student ? '/student/requests' : '/admin/certificate-requests'}
        className="text-sm text-brand underline underline-offset-4"
      >
        {student ? 'Back to my requests' : 'Back to certificate requests'}
      </Link>
      <PageHeader
        title={titles[r.certificateType] ?? r.certificateType}
        description={r.reference}
      />
      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <Badge status={r.status} />
        <p className="mt-4">{r.nextAction}</p>
        {r.student && (
          <p className="mt-3 font-medium">
            {r.student.name} · {r.student.registrations.join(', ')}
          </p>
        )}
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Submitted</dt>
            <dd className="mt-1 text-sm">{formatDateTime(r.submittedAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Purpose</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
              {r.purpose || 'Not supplied'}
            </dd>
          </div>
          {r.remarks && (
            <div>
              <dt className="text-sm text-muted-foreground">Student remarks</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{r.remarks}</dd>
            </div>
          )}
        </dl>
        <p className="mt-5 text-sm text-muted-foreground">
          Staff review does not issue a certificate. Official documents require a separate approved
          issuance policy and independent approval. Payment verification and Rector approval remain
          unavailable.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {student && r.canRespond && (
            <RequestAction r={r} student action="respond" label="Provide information" />
          )}
          {student && r.canCancel && (
            <RequestAction r={r} student action="cancel" label="Cancel application" />
          )}
          {!student && canReview && r.canReview && r.status !== 'INFORMATION_REQUESTED' && (
            <>
              <RequestAction
                r={r}
                student={false}
                action="request-information"
                label="Request information"
              />
              <RequestAction
                r={r}
                student={false}
                action="record-review"
                label="Record private review"
              />
            </>
          )}
          {!student && canReview && r.canCompleteReview && (
            <RequestAction
              r={r}
              student={false}
              action="complete-review"
              label="Complete staff review"
            />
          )}
          {!student && r.status === 'REVIEW_COMPLETED' && (
            <Link
              href={
                r.certificateType === 'COURSE_COMPLETION'
                  ? `/admin/official-records?requestId=${r.id}`
                  : `/admin/official-records?tab=documents&type=${r.certificateType}&requestId=${r.id}`
              }
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-brand"
            >
              Prepare official document
            </Link>
          )}
          {!student && canReview && ['REVIEW_COMPLETED', 'CANCELLED'].includes(r.status) && (
            <RequestAction r={r} student={false} action="close" label="Close application" />
          )}
        </div>
      </section>
      {student && (
        <PaymentButtonPanel service="CERTIFICATE_HARD_COPY" path={`certificate/${r.id}`} />
      )}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-4 text-lg font-semibold">
          Application history
        </h2>
        <ol className="divide-y rounded-xl border bg-card">
          {r.events?.map((e) => (
            <li key={e.id} className="p-5 sm:p-6">
              <h3 className="text-sm font-semibold">{actions[e.action] ?? e.action}</h3>
              <time className="mt-1 block text-xs text-muted-foreground" dateTime={e.createdAt}>
                {formatDateTime(e.createdAt)}
              </time>
              {e.studentMessage && (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm">{e.studentMessage}</p>
              )}
              {e.privateNote && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground">Private staff note</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{e.privateNote}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The five certificate types students may apply for, in the university's order. */
const STUDENT_CERTIFICATES = [
  ['TRANSCRIPT', 'Transcript'],
  ['PROVISIONAL', 'Provisional Certificate'],
  ['CHARACTER', 'Character Certificate'],
  ['MIGRATION', 'Migration Certificate'],
  ['COURSE_COMPLETION', 'Course Completion Certificate'],
] as const satisfies readonly (readonly [CertificateType, string])[];

/**
 * Certificate Request: the sample link, then one row per certificate type. "Apply" opens the
 * existing application form only when the server says the service is available under policy;
 * otherwise the row honestly says "Not yet available" (nothing is submitted).
 */
function StudentCertificateServices() {
  const catalogue = useQuery({ queryKey: ['certificate-services'], queryFn: api.catalogue });
  const [selected, setSelected] = useState<CertificateType | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Certificate Request" />
      <Link
        href="/student/certificate-requests/samples"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-brand hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <FileBadgeIcon aria-hidden="true" className="size-4" />
        View Certificate Sample
      </Link>
      {catalogue.isPending ? (
        <TableSkeleton rows={5} />
      ) : catalogue.isError ? (
        <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
      ) : (
        <ul aria-label="Certificates" className="divide-y rounded-xl border bg-card">
          {STUDENT_CERTIFICATES.map(([type, title]) => {
            const available =
              catalogue.data.data.find((s) => s.certificateType === type)?.available ?? false;
            return (
              <li
                key={type}
                className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6"
              >
                <h2 className="font-semibold text-navy-950">{title}</h2>
                {available ? (
                  <Button
                    aria-label={`Apply for ${title}`}
                    onClick={() => {
                      setSelected(type);
                    }}
                  >
                    Apply
                    <ArrowRightIcon aria-hidden="true" />
                  </Button>
                ) : (
                  <Button variant="outline" disabled aria-label={`${title}: not yet available`}>
                    Not yet available
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {selected && (
        <ApplicationForm
          key={selected}
          type={selected}
          onDone={() => {
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

/** The signed-in student's certificate applications (shown under My Requests). */
export function StudentCertificateApplications() {
  return <RequestsView student />;
}

function StaffRequestsView() {
  const canRead = useCan(PERMISSIONS.certificateRequestsRead);
  return <RequestsView canRead={canRead} />;
}
export function CertificateRequestsView({ student = false }: { student?: boolean }) {
  return student ? <StudentCertificateServices /> : <StaffRequestsView />;
}
function StaffRequestDetail({ id }: { id: string }) {
  const canRead = useCan(PERMISSIONS.certificateRequestsRead),
    canReview = useCan(PERMISSIONS.certificateRequestsReview);
  return <RequestDetailView id={id} canRead={canRead} canReview={canReview} />;
}
export function CertificateRequestDetailView({
  id,
  student = false,
}: {
  id: string;
  student?: boolean;
}) {
  return student ? <RequestDetailView id={id} student /> : <StaffRequestDetail id={id} />;
}
