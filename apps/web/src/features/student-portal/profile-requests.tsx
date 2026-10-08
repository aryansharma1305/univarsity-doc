'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2Icon, XIcon } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import {
  PROFILE_FIELD_LABELS,
  type ProfileRequestField,
  type ProfileRequestStatus,
  type StudentProfileRequest,
} from '@docversity/validation';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { studentPortalApi } from './api';

const STATUS: Record<ProfileRequestStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Pending review', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export function ProfileRequestStatus({ status }: { status: ProfileRequestStatus }) {
  return <StatusBadge tone={STATUS[status].tone}>{STATUS[status].label}</StatusBadge>;
}

function show(field: ProfileRequestField, value: string | null): string {
  if (!value) return 'Not on record';
  return field === 'dateOfBirth' ? formatDate(value) : value;
}

function CancelRequest({ request }: { request: StudentProfileRequest }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        <XIcon aria-hidden="true" />
        Cancel request
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setError(null);
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this request?</DialogTitle>
            <DialogDescription>
              The university will not review it and your official profile stays as it is. You can
              submit a new request afterwards.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
            >
              Keep request
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setPending(true);
                setError(null);
                studentPortalApi
                  .cancelProfileRequest(request.id)
                  .then(() => {
                    setOpen(false);
                    // Re-render with fresh data (and drop a "just submitted" confirmation).
                    router.replace('/student/profile/requests');
                    router.refresh();
                  })
                  .catch((caught: unknown) => {
                    setError(errorMessage(caught));
                  })
                  .finally(() => {
                    setPending(false);
                  });
              }}
            >
              {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One request as its student sees it: what was asked, the outcome and (if rejected) why. */
export function ProfileRequestCard({ request }: { request: StudentProfileRequest }) {
  const decided =
    request.status === 'APPROVED' || request.status === 'REJECTED'
      ? 'Reviewed'
      : request.status === 'CANCELLED'
        ? 'Cancelled'
        : null;
  return (
    <article
      aria-label={`Request submitted ${formatDateTime(request.submittedAt)}`}
      className="rounded-xl border border-border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-navy-950">Profile update request</h2>
          <p className="text-meta">
            Submitted{' '}
            <time dateTime={request.submittedAt}>{formatDateTime(request.submittedAt)}</time>
            {decided && request.decidedAt && (
              <>
                {' · '}
                {decided}{' '}
                <time dateTime={request.decidedAt}>{formatDateTime(request.decidedAt)}</time>
              </>
            )}
          </p>
        </div>
        <ProfileRequestStatus status={request.status} />
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">
        {request.changes.length > 0 && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {request.changes.map((change) => (
              <div key={change.field} className="rounded-lg bg-muted/50 p-3">
                <dt className="font-medium text-navy-950">{PROFILE_FIELD_LABELS[change.field]}</dt>
                <dd className="mt-1 break-words">
                  <span className="text-foreground/80">{show(change.field, change.previous)}</span>
                  <span aria-hidden="true" className="mx-1.5 text-foreground/80">
                    →
                  </span>
                  <span className="sr-only"> changed to </span>
                  <span className="font-medium text-navy-950">
                    {show(change.field, change.proposed)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {request.photo && (
          <div className="flex items-center gap-3 text-sm">
            <Image
              src={`/api/v1/student/profile-requests/${request.id}/photo`}
              alt="Photo submitted with this request"
              width={64}
              height={64}
              unoptimized
              className="size-16 rounded-full object-cover ring-2 ring-border"
            />
            <span className="text-navy-950">New photo</span>
          </div>
        )}
        {request.note && (
          <p className="text-sm">
            <span className="text-muted-foreground">Your note: </span>
            <span className="break-words text-navy-950">{request.note}</span>
          </p>
        )}
        {request.status === 'REJECTED' && request.rejectionReason && (
          <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm">
            <p className="font-semibold text-danger-text">Reason from the university</p>
            <p className="mt-1 break-words text-navy-950">{request.rejectionReason}</p>
          </div>
        )}
        {request.status === 'APPROVED' && (
          <p className="text-sm text-success-text">Your official profile has been updated.</p>
        )}
        {request.status === 'PENDING' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Waiting for review. Your official profile is unchanged until it is approved.
            </p>
            <CancelRequest request={request} />
          </div>
        )}
      </div>
    </article>
  );
}
