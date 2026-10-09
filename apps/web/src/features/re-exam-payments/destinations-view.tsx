'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, ShieldAlertIcon } from 'lucide-react';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_REGION_LABELS,
  type PaymentDestinationList,
} from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { ErrorState, TableSkeleton } from '@/components/data/states';
import { formatDateTime } from '@/lib/format';
import { paymentsApi, useDestinations, usePaymentMutation } from './api';
import { defaultsFrom, DestinationForm } from './destination-form';
import { DESTINATION_STATE } from './labels';

function NewDestinationDialog({
  open,
  onOpenChange,
  feeCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeCurrency: string | null;
}) {
  const router = useRouter();
  const create = usePaymentMutation(paymentsApi.createDestination);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New payment details (draft)</DialogTitle>
          <DialogDescription>
            Enter only details the university has approved. Students see nothing until the QR image
            is uploaded and another authorised staff member approves the draft.
          </DialogDescription>
        </DialogHeader>
        <DestinationForm
          mode="create"
          initial={defaultsFrom(null)}
          feeCurrency={feeCurrency}
          submitLabel="Save draft"
          onCancel={() => {
            onOpenChange(false);
          }}
          onSubmit={async (payload) => {
            const created = await create.mutateAsync(
              payload as Parameters<typeof paymentsApi.createDestination>[0],
            );
            toast.success('Draft saved. Upload the QR image next.');
            onOpenChange(false);
            router.push(`/admin/settings/re-exam-payments/${created.id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function RegionCard({ entry }: { entry: PaymentDestinationList['regions'][number] }) {
  const approved = entry.approved;
  return (
    <Card className="gap-0 py-0 shadow-card">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-navy-950">
            {entry.label}
            {entry.isGroup && <span className="text-meta font-normal"> · region group</span>}
          </h2>
        </div>
        {approved ? (
          <>
            <StatusBadge tone={DESTINATION_STATE[approved.state].tone}>
              {DESTINATION_STATE[approved.state].label}
            </StatusBadge>
            <p className="text-sm break-words text-navy-950">{approved.beneficiaryName}</p>
            <p className="text-meta">
              {approved.currency} · {PAYMENT_METHOD_LABELS[approved.method]} · version{' '}
              {approved.version}
            </p>
            <Link
              href={`/admin/settings/re-exam-payments/${approved.id}`}
              className="mt-auto text-sm font-medium text-brand hover:underline"
            >
              View {entry.label} details
            </Link>
          </>
        ) : (
          <p className="text-sm text-foreground/80">
            Not configured — students choosing {entry.label} are told payment details are not
            available.
          </p>
        )}
        {entry.draftCount > 0 && (
          <p className="text-meta">
            {entry.draftCount} draft{entry.draftCount === 1 ? '' : 's'} awaiting approval
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function PaymentDestinationsView() {
  const query = useDestinations();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Re-exam payment settings"
        description="Payment details shown to students per country or region. Students pay outside Docversity; staff verify every payment against the university’s account."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <PlusIcon aria-hidden="true" />
            New draft
          </Button>
        }
      />
      <div
        role="note"
        className="mb-5 flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-navy-950"
      >
        <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" />
        <p>
          Use only the university’s real, approved beneficiary, QR and amounts — never test or
          invented details. Each draft needs a second authorised person to approve it. Approved
          details are frozen; to change a QR, prepare a replacement.
        </p>
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <p className="mb-3 text-sm text-foreground/80">
            {query.data.feeCurrency
              ? `Active re-exam fee rule currency: ${query.data.feeCurrency}. Other currencies need amounts approved per attempt.`
              : 'No re-exam fee rule is active — no student can start a payment yet.'}
          </p>
          <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {query.data.regions.map((entry) => (
              <li key={entry.region}>
                <RegionCard entry={entry} />
              </li>
            ))}
          </ul>
          <h2 className="text-section-title mt-8 mb-3 text-navy-950">All versions</h2>
          {query.data.data.length === 0 ? (
            <p className="text-sm text-foreground/80">No payment details have been entered yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {query.data.data.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/settings/re-exam-payments/${d.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {PAYMENT_REGION_LABELS[d.region]} · version {d.version}
                    </Link>
                    <p className="text-meta break-words">
                      {d.beneficiaryName} · {d.currency} · updated {formatDateTime(d.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge tone={DESTINATION_STATE[d.state].tone}>
                    {DESTINATION_STATE[d.state].label}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
          <NewDestinationDialog
            open={creating}
            onOpenChange={setCreating}
            feeCurrency={query.data.feeCurrency}
          />
        </>
      )}
    </>
  );
}
