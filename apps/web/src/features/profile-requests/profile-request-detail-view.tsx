'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangleIcon, CheckIcon, ImageOffIcon, Loader2Icon, XIcon } from 'lucide-react';
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
import {
  PROFILE_FIELD_LABELS,
  type ProfileRequestDetail,
  type ProfileRequestField,
} from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { EmptyState, ErrorState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  profileRequestPhotoUrl,
  useApproveProfileRequest,
  useProfileRequest,
  useRejectProfileRequest,
} from './api';
import { ProfileRequestStatusBadge } from './profile-requests-view';

function show(field: ProfileRequestField, value: string | null): string {
  if (value === null) return 'Not on record';
  return field === 'dateOfBirth' ? formatDate(value) : value;
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

function Photo({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="flex flex-col items-center gap-2">
      {failed ? (
        <span className="flex size-40 flex-col items-center justify-center gap-1 rounded-lg bg-muted text-center text-xs text-muted-foreground">
          <ImageOffIcon aria-hidden="true" className="size-6" />
          Could not load
        </span>
      ) : (
        <Image
          src={src}
          alt={label}
          width={160}
          height={200}
          unoptimized
          className="h-48 w-40 rounded-lg border border-border bg-muted object-cover"
          onError={() => {
            setFailed(true);
          }}
        />
      )}
      <figcaption className="text-meta">{label}</figcaption>
    </figure>
  );
}

function Comparison({ request }: { request: ProfileRequestDetail }) {
  const decided = request.status !== 'PENDING';
  return (
    <>
      {/* Phones: one card per change (no sideways scrolling). */}
      <ul className="flex flex-col gap-3 sm:hidden" aria-label="Requested changes">
        {request.changes.map((change) => (
          <li key={change.field} className="rounded-lg border border-border p-3 text-sm">
            <p className="font-semibold text-navy-950">{PROFILE_FIELD_LABELS[change.field]}</p>
            <dl className="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5">
              <dt className="text-foreground/80">At submission</dt>
              <dd className="break-words">{show(change.field, change.previous)}</dd>
              <dt className="text-foreground/80">Proposed</dt>
              <dd className="font-medium break-words text-navy-950">
                {show(change.field, change.proposed)}
              </dd>
              <dt className="text-foreground/80">Official now</dt>
              <dd className="break-words">
                {show(change.field, change.current)}
                {!decided && change.changedSinceSubmission && (
                  <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning-text">
                    <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
                    Changed since submission
                  </span>
                )}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">Requested changes compared with the official record</caption>
          <thead className="bg-muted text-foreground/80">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Detail
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                On record at submission
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Proposed by student
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Official now
              </th>
            </tr>
          </thead>
          <tbody>
            {request.changes.map((change) => (
              <tr key={change.field} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 font-medium text-navy-950">
                  {PROFILE_FIELD_LABELS[change.field]}
                </th>
                <td className="px-3 py-2 break-words text-muted-foreground">
                  {show(change.field, change.previous)}
                </td>
                <td className="px-3 py-2 font-medium break-words text-navy-950">
                  {show(change.field, change.proposed)}
                </td>
                <td className="px-3 py-2 break-words">
                  {show(change.field, change.current)}
                  {!decided && change.changedSinceSubmission && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning-text">
                      <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
                      Changed since submission
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ApproveDialog({
  request,
  open,
  onOpenChange,
}: {
  request: ProfileRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useApproveProfileRequest(request.id);
  const changed = [
    ...request.changes.map((change) => PROFILE_FIELD_LABELS[change.field]),
    ...(request.photo ? ['Photo'] : []),
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve this request?</DialogTitle>
          <DialogDescription>
            {request.student.fullName}’s official record will be updated: {changed.join(', ')}.
            Nothing else changes.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              mutation.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Request approved. The official record was updated.');
                  onOpenChange(false);
                },
              });
            }}
          >
            {mutation.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Approve and update record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  request,
  open,
  onOpenChange,
}: {
  request: ProfileRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const mutation = useRejectProfileRequest(request.id);
  const tooShort = reason.trim().length < 5;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          mutation.reset();
          setReason('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject this request</DialogTitle>
          <DialogDescription>
            The official record is not changed. The student sees your reason, so explain what is
            wrong and what they should do next.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Reason (shown to the student)</Label>
          <Textarea
            id={id}
            value={reason}
            maxLength={1000}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <p id={`${id}-hint`} className="text-meta">
            Required, at least 5 characters.
          </p>
        </div>
        {mutation.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || tooShort}
            onClick={() => {
              mutation.mutate(
                { reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success('Request rejected. The student can see your reason.');
                    setReason('');
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {mutation.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Reject request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Decision({ request }: { request: ProfileRequestDetail }) {
  const canReview = useCan(PERMISSIONS.studentProfileRequestsReview);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  if (request.status !== 'PENDING') {
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-meta">Outcome</dt>
          <dd className="mt-1">
            <ProfileRequestStatusBadge status={request.status} />
          </dd>
        </div>
        <div>
          <dt className="text-meta">{request.status === 'CANCELLED' ? 'Cancelled' : 'Reviewed'}</dt>
          <dd className="mt-1 text-navy-950">
            {request.status === 'CANCELLED'
              ? `By the student · ${request.cancelledAt ? formatDateTime(request.cancelledAt) : '—'}`
              : `${request.reviewer?.displayName ?? '—'} · ${request.reviewedAt ? formatDateTime(request.reviewedAt) : '—'}`}
          </dd>
        </div>
        {request.rejectionReason && (
          <div className="sm:col-span-2">
            <dt className="text-meta">Reason given to the student</dt>
            <dd className="mt-1 break-words text-navy-950">{request.rejectionReason}</dd>
          </div>
        )}
      </dl>
    );
  }
  if (!canReview) {
    return (
      <p className="text-sm text-muted-foreground">
        Waiting for review. You can view this request but not decide it.
      </p>
    );
  }
  return (
    <>
      {request.stale && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-navy-950"
        >
          <AlertTriangleIcon
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-warning-text"
          />
          <div>
            <p className="font-semibold">The official record changed after this was submitted</p>
            <p className="mt-1">
              It cannot be approved, because that would overwrite newer data. Reject it and ask the
              student to submit a new request if a change is still needed.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
          disabled={request.stale}
          onClick={() => {
            setDialog('approve');
          }}
        >
          <CheckIcon aria-hidden="true" />
          Approve
        </Button>
      </div>
      <ApproveDialog
        request={request}
        open={dialog === 'approve'}
        onOpenChange={(open) => {
          setDialog(open ? 'approve' : null);
        }}
      />
      <RejectDialog
        request={request}
        open={dialog === 'reject'}
        onOpenChange={(open) => {
          setDialog(open ? 'reject' : null);
        }}
      />
    </>
  );
}

export function ProfileRequestDetailView({ requestId }: { requestId: string }) {
  const query = useProfileRequest(requestId);
  useSetBreadcrumbLabel(query.data ? query.data.student.fullName : null);
  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const request = query.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-page-title break-words text-navy-950">{request.student.fullName}</h1>
          <p className="text-meta mt-1 break-all">
            {request.registrationNumbers.join(', ') || 'No registration'} · Submitted{' '}
            {formatDateTime(request.submittedAt)}
          </p>
          <Link
            href={`/admin/students/${request.student.id}`}
            className="mt-2 inline-block rounded text-sm font-medium text-brand hover:underline"
          >
            Open student record
          </Link>
        </div>
        <div className="self-start sm:self-auto">
          <ProfileRequestStatusBadge status={request.status} />
        </div>
      </div>

      <Section title="Decision">
        <Decision request={request} />
      </Section>

      {request.changes.length > 0 && (
        <Section title="Requested changes">
          <Comparison request={request} />
        </Section>
      )}

      {request.photo && (
        <Section title="Photo">
          <div className="flex flex-wrap gap-6">
            {request.hasOfficialPhoto ? (
              <Photo
                src={profileRequestPhotoUrl(request.id, 'official')}
                label="Official photo now"
              />
            ) : (
              <figure className="flex flex-col items-center gap-2">
                <span className="flex h-48 w-40 items-center justify-center rounded-lg border border-dashed border-border-strong text-center text-sm text-muted-foreground">
                  No official photo
                </span>
                <figcaption className="text-meta">Official photo now</figcaption>
              </figure>
            )}
            <Photo src={profileRequestPhotoUrl(request.id, 'proposed')} label="Proposed photo" />
          </div>
          <p className="text-meta">
            Proposed photo: {request.photo.width} × {request.photo.height} px, re-encoded by the
            system (metadata removed).
            {request.status === 'PENDING' && request.photo.officialPhotoChangedSinceSubmission
              ? ' The official photo changed after submission.'
              : ''}
          </p>
        </Section>
      )}

      {request.note && (
        <Section title="Student’s note">
          <p className="text-sm break-words text-navy-950">{request.note}</p>
        </Section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="History">
          {request.history.length === 0 ? (
            <EmptyState title="No history recorded" />
          ) : (
            <ol className="divide-y divide-border rounded-lg border border-border">
              {request.history.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="text-sm text-navy-950">{item.summary}</span>
                  <span className="text-meta">
                    {item.actor ?? 'System'} · {formatDateTime(item.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
        <Section title="Other requests from this student">
          {request.otherRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {request.otherRequests.map((other) => (
                <li key={other.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link
                    href={`/admin/profile-requests/${other.id}`}
                    className="rounded text-sm font-medium text-brand hover:underline"
                  >
                    {formatDateTime(other.submittedAt)}
                  </Link>
                  <ProfileRequestStatusBadge status={other.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
