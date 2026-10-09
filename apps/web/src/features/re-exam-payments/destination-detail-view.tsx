'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@docversity/ui';
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
import {
  formatMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_QR_RULES,
  PAYMENT_REGION_LABELS,
  type PaymentDestinationDetail,
} from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { ErrorState } from '@/components/data/states';
import { useSessionUser } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  destinationQrUrl,
  paymentsApi,
  useDestination,
  useDestinations,
  usePaymentMutation,
} from './api';
import { defaultsFrom, DestinationForm, minorToMajor } from './destination-form';
import { DESTINATION_STATE } from './labels';

function Row({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      <dt className="text-meta">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line text-navy-950">
        {value?.trim() ? value : '—'}
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

function QrUpload({ destination }: { destination: PaymentDestinationDetail }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const upload = usePaymentMutation((f: File) => paymentsApi.uploadQr(destination.id, f));
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file) return;
        upload.mutate(file, {
          onSuccess: () => {
            toast.success('QR image saved (re-encoded without metadata).');
            setFile(null);
          },
        });
      }}
    >
      <Label htmlFor={inputId}>
        {destination.qr ? 'Replace the draft’s QR image' : 'QR image'} (PNG or JPEG, up to{' '}
        {PAYMENT_QR_RULES.maxBytes / (1024 * 1024)} MB)
      </Label>
      <Input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
        }}
      />
      {upload.error && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMessage(upload.error)}
        </p>
      )}
      <Button
        type="submit"
        variant="outline"
        className="self-start"
        disabled={!file || upload.isPending}
      >
        {upload.isPending ? 'Uploading…' : 'Upload QR image'}
      </Button>
    </form>
  );
}

function ApproveDialog({
  destination,
  onClose,
}: {
  destination: PaymentDestinationDetail;
  onClose: () => void;
}) {
  const checkId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const approve = usePaymentMutation(() => paymentsApi.approve(destination.id));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve these payment details?</DialogTitle>
          <DialogDescription>
            {PAYMENT_REGION_LABELS[destination.region]}: students will see this beneficiary, QR and
            instructions while the details are switched on and in effect.
            {destination.replacesDestinationId
              ? ' The version it replaces is retired at the same time; payments already started keep their version.'
              : ''}
          </DialogDescription>
        </DialogHeader>
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
            I confirm the university approved this beneficiary, currency, amounts and QR, and that
            the QR is the university’s real payment QR (not a test image).
          </Label>
        </div>
        {approve.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(approve.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!confirmed || approve.isPending}
            onClick={() => {
              approve.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Payment details approved.');
                  onClose();
                },
              });
            }}
          >
            {approve.isPending ? 'Approving…' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDestinationDetailView({ destinationId }: { destinationId: string }) {
  const router = useRouter();
  const query = useDestination(destinationId);
  const list = useDestinations();
  const user = useSessionUser();
  const [approving, setApproving] = useState(false);
  const toggle = usePaymentMutation((active: boolean) =>
    paymentsApi.setActive(destinationId, active),
  );
  const retire = usePaymentMutation(() => paymentsApi.retire(destinationId));
  const update = usePaymentMutation((body: Record<string, unknown>) =>
    paymentsApi.updateDestination(destinationId, body),
  );
  const replace = usePaymentMutation(paymentsApi.createDestination);
  useSetBreadcrumbLabel(
    query.data
      ? `${PAYMENT_REGION_LABELS[query.data.region]} v${String(query.data.version)}`
      : null,
  );

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const d = query.data;
  const state = DESTINATION_STATE[d.state];
  const ownDraft = d.createdBy?.id === user.id || d.updatedBy?.id === user.id;
  const failed = toggle.error ?? retire.error ?? replace.error;

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-meta">Re-exam payment details · version {d.version}</p>
            <h1 className="text-page-title break-words text-navy-950">
              {PAYMENT_REGION_LABELS[d.region]}
              {d.countryName ? ` — ${d.countryName}` : ''}
            </h1>
            <div className="mt-2">
              <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.status === 'DRAFT' && (
              <Button
                disabled={!d.qr || ownDraft}
                title={
                  ownDraft
                    ? 'Another authorised staff member must approve details you prepared or changed.'
                    : undefined
                }
                onClick={() => {
                  setApproving(true);
                }}
              >
                Approve
              </Button>
            )}
            {d.status === 'APPROVED' && (
              <>
                <Button
                  variant="outline"
                  disabled={toggle.isPending}
                  onClick={() => {
                    toggle.mutate(!d.isActive, {
                      onSuccess: () =>
                        toast.success(d.isActive ? 'Switched off for students.' : 'Switched on.'),
                    });
                  }}
                >
                  {d.isActive ? 'Switch off' : 'Switch on'}
                </Button>
                <Button
                  variant="outline"
                  disabled={replace.isPending}
                  onClick={() => {
                    replace.mutate(
                      {
                        region: d.region,
                        countryName: d.countryName,
                        beneficiaryName: d.beneficiaryName,
                        method: d.method,
                        currency: d.currency,
                        instructions: d.instructions,
                        evidenceRequirement: d.evidenceRequirement,
                        effectiveFrom: new Date().toISOString(),
                        effectiveUntil: d.effectiveUntil,
                        rates: d.rates.map((r) => ({
                          attemptNumber: r.attemptNumber,
                          amount: minorToMajor(r.amountMinor, d.currency),
                        })),
                        replacesDestinationId: d.id,
                      },
                      {
                        onSuccess: (created) => {
                          toast.success('Replacement draft created. Upload the new QR image.');
                          router.push(`/admin/settings/re-exam-payments/${created.id}`);
                        },
                      },
                    );
                  }}
                >
                  Prepare replacement
                </Button>
              </>
            )}
            {d.status !== 'RETIRED' && (
              <Button
                variant="outline"
                disabled={retire.isPending}
                onClick={() => {
                  retire.mutate(undefined, { onSuccess: () => toast.success('Retired.') });
                }}
              >
                Retire
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      {failed && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMessage(failed)}
        </p>
      )}
      {d.status === 'DRAFT' && ownDraft && (
        <p className="text-sm text-foreground/80">
          You prepared or last changed this draft, so another authorised staff member must approve
          it.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Section title="Details shown to students">
          {d.status === 'DRAFT' ? (
            <DestinationForm
              key={d.updatedAt}
              mode="edit"
              initial={defaultsFrom(d)}
              feeCurrency={list.data?.feeCurrency ?? null}
              submitLabel="Save draft"
              onSubmit={async (payload) => {
                await update.mutateAsync(payload);
                toast.success('Draft saved.');
              }}
            />
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Row label="Beneficiary" value={d.beneficiaryName} />
              <Row label="Method" value={PAYMENT_METHOD_LABELS[d.method]} />
              <Row label="Currency" value={d.currency} />
              <Row
                label="Amounts"
                value={
                  d.rates.length > 0
                    ? d.rates
                        .map(
                          (r) =>
                            `Attempt ${String(r.attemptNumber)}: ${formatMoney(r.amountMinor, d.currency)}`,
                        )
                        .join('\n')
                    : 'From the re-exam fee rule (each student’s assessed fee)'
                }
              />
              <Row
                label="Receipt"
                value={d.evidenceRequirement === 'REQUIRED' ? 'Required' : 'Optional'}
              />
              <Row
                label="Validity"
                value={`${formatDateTime(d.effectiveFrom)} – ${d.effectiveUntil ? formatDateTime(d.effectiveUntil) : 'no end date'}`}
              />
              <Row label="Instructions" value={d.instructions} className="sm:col-span-2" />
            </dl>
          )}
        </Section>
        <Section title="QR image">
          {d.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, permission-checked image
            <img
              src={destinationQrUrl(d.id, d.qr.sha256)}
              alt={`Payment QR for ${PAYMENT_REGION_LABELS[d.region]}, version ${String(d.version)}`}
              className="mx-auto w-full max-w-64 rounded-md border border-border bg-white"
            />
          ) : (
            <p className="text-sm text-foreground/80">No QR image uploaded yet.</p>
          )}
          {d.qr && (
            <p className="text-meta break-all">
              Stored copy SHA-256 {d.qr.sha256.slice(0, 16)}… · {Math.ceil(d.qr.sizeBytes / 1024)}{' '}
              KB
            </p>
          )}
          {d.status === 'DRAFT' && <QrUpload destination={d} />}
          <p className="text-xs text-foreground/80">
            Docversity cannot read what a QR encodes. Check it with a payment app before approving.
          </p>
        </Section>
      </div>

      <Section title="Approvals and history">
        <dl className="grid gap-3 sm:grid-cols-3">
          <Row
            label="Prepared"
            value={`${formatDateTime(d.createdAt)}${d.createdBy ? ` by ${d.createdBy.displayName}` : ''}`}
          />
          <Row
            label="Approved"
            value={
              d.approvedAt
                ? `${formatDateTime(d.approvedAt)}${d.approvedBy ? ` by ${d.approvedBy.displayName}` : ''}`
                : null
            }
          />
          <Row label="Payments started with this version" value={String(d.paymentCount)} />
        </dl>
        <ol className="divide-y divide-border rounded-lg border border-border">
          {d.history.map((item) => (
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
      {approving && (
        <ApproveDialog
          destination={d}
          onClose={() => {
            setApproving(false);
          }}
        />
      )}
    </div>
  );
}
