'use client';

import Link from 'next/link';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@docversity/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import type { ImportJob } from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { PageHeader } from '@/components/data/page-header';
import { ErrorState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { importsApi, useImportJob, useImportStep } from './api';
import { ImportStepper, ProgressBar, stepForStatus } from './import-stepper';
import { formatBytes, formatCount, IMPORT_STATUS } from './labels';
import { MappingPanel } from './mapping-panel';
import { type RowFilterOption, RowsSection } from './rows-section';

function SummaryCards({
  items,
}: {
  items: { label: string; value: number; tone?: 'success' | 'warning' | 'danger' }[];
}) {
  const toneClass = {
    success: 'text-success-text',
    warning: 'text-warning-text',
    danger: 'text-danger-text',
  };
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border bg-card p-3 shadow-card">
          <dt className="text-meta">{item.label}</dt>
          <dd
            className={`text-2xl font-semibold tabular ${item.tone && item.value > 0 ? toneClass[item.tone] : 'text-navy-950'}`}
          >
            {formatCount(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function WorkingPanel({
  job,
  title,
  description,
}: {
  job: ImportJob;
  title: string;
  description: string;
}) {
  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2 text-card-title">
            <Loader2Icon aria-hidden="true" className="size-5 animate-spin text-brand" />
            {title}
          </h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ProgressBar value={job.progress} label={title} />
        <p className="mt-3 text-meta">
          You can leave this page — the work continues in the background and the progress is saved.
        </p>
      </CardContent>
    </Card>
  );
}

function ReportButton({ job }: { job: ImportJob }) {
  const [busy, setBusy] = useState(false);
  if (!job.hasErrorReport) return null;
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        importsApi
          .downloadReport(job.id)
          .catch((error: unknown) => toast.error(errorMessage(error)))
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      {busy ? (
        <Loader2Icon aria-hidden="true" className="animate-spin" />
      ) : (
        <DownloadIcon aria-hidden="true" />
      )}
      Download error report
    </Button>
  );
}

function reviewFilters(job: ImportJob): RowFilterOption[] {
  const c = job.counts;
  return [
    { value: 'all', label: 'All', count: c.total },
    { value: 'valid', label: 'Valid', count: c.valid },
    { value: 'warnings', label: 'Warnings', count: c.warnings },
    { value: 'errors', label: 'Errors', count: c.errors },
    { value: 'create', label: 'Create', count: c.create },
    { value: 'update', label: 'Update', count: c.update },
    { value: 'skip', label: 'No change', count: c.unchanged },
  ];
}

/** Step 5–6: what will happen, explicit approval of updates, confirmation. */
function CommitCard({ job }: { job: ImportJob }) {
  const checkboxId = useId();
  const [applyUpdates, setApplyUpdates] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const commit = useImportStep(job.id, () => importsApi.commit(job.id, { applyUpdates }));
  const c = job.counts;
  const toImport = c.create + (applyUpdates ? c.update : 0);
  const skipped = c.unchanged + (applyUpdates ? 0 : c.update);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-card-title">Import</h2>
        </CardTitle>
        <CardDescription>
          Only valid rows are imported. Rows with errors are never imported — fix them in the
          workbook and import them again later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <strong className="tabular">{formatCount(c.create)}</strong> new students and
            registrations will be created.
          </li>
          {c.update > 0 && (
            <li>
              <strong className="tabular">{formatCount(c.update)}</strong> existing records have
              proposed changes
              {applyUpdates
                ? ' and will be updated.'
                : ' — they are skipped unless you approve them below.'}
            </li>
          )}
          <li>
            <strong className="tabular">{formatCount(skipped)}</strong> rows will be skipped (no
            change{c.update > 0 && !applyUpdates ? ' or not approved' : ''}).
          </li>
          <li>
            <strong className="tabular">{formatCount(c.errors)}</strong> rows have errors and will
            not be imported.
          </li>
        </ul>
        {c.update > 0 && (
          <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning-soft p-3">
            <input
              id={checkboxId}
              type="checkbox"
              className="mt-1 size-4 accent-[var(--color-brand)]"
              checked={applyUpdates}
              onChange={(event) => {
                setApplyUpdates(event.target.checked);
              }}
            />
            <label htmlFor={checkboxId} className="text-sm text-navy-950">
              Also apply the {formatCount(c.update)} proposed updates to existing records. Only
              names, date of birth, gender, roll/reference number and admission/completion dates can
              change. Review them with the “Update” filter first.
            </label>
          </div>
        )}
        <div>
          <Button
            disabled={toImport === 0}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Import {formatCount(toImport)} {toImport === 1 ? 'row' : 'rows'}
          </Button>
          {toImport === 0 && <p className="mt-2 text-meta">There is nothing to import.</p>}
        </div>
      </CardContent>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import {formatCount(toImport)} rows?</DialogTitle>
            <DialogDescription>
              {formatCount(c.create)} records will be created
              {applyUpdates && c.update > 0 ? ` and ${formatCount(c.update)} updated` : ''}. This
              writes to the official student records and is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          {commit.error && (
            <p role="alert" className="text-sm text-danger-text">
              {errorMessage(commit.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Go back
            </Button>
            <Button
              disabled={commit.isPending}
              onClick={() => {
                commit.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                  },
                });
              }}
            >
              {commit.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              Import now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ReviewPanel({ job, canRun }: { job: ImportJob; canRun: boolean }) {
  const [remapping, setRemapping] = useState(false);
  const revalidate = useImportStep(job.id, () => importsApi.validate(job.id));
  const c = job.counts;
  if (remapping) {
    return (
      <MappingPanel
        job={job}
        canRun={canRun}
        onCancelEdit={() => {
          setRemapping(false);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
        <h2 id="summary-heading" className="text-section-title text-navy-950">
          Validation summary
        </h2>
        <SummaryCards
          items={[
            { label: 'Total rows', value: c.total },
            { label: 'Valid', value: c.valid, tone: 'success' },
            { label: 'Warnings', value: c.warnings, tone: 'warning' },
            { label: 'Errors', value: c.errors, tone: 'danger' },
            { label: 'Create', value: c.create },
            { label: 'Update', value: c.update },
            { label: 'No change', value: c.unchanged },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ReportButton job={job} />
          {canRun && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setRemapping(true);
                }}
              >
                Change mapping
              </Button>
              <Button
                variant="outline"
                disabled={revalidate.isPending}
                onClick={() => {
                  revalidate.mutate(undefined);
                }}
              >
                <RefreshCwIcon aria-hidden="true" />
                Validate again
              </Button>
            </>
          )}
        </div>
        {revalidate.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(revalidate.error)}
          </p>
        )}
      </section>
      {canRun && <CommitCard job={job} />}
      <RowsSection importId={job.id} filters={reviewFilters(job)} />
    </div>
  );
}

function CompletedPanel({ job }: { job: ImportJob }) {
  const c = job.counts;
  const canSeeAccounts = useCan(PERMISSIONS.studentAccountsRead);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2 text-card-title">
              <CheckCircle2Icon aria-hidden="true" className="size-5 text-success" />
              Import completed
            </h2>
          </CardTitle>
          <CardDescription>
            {job.completedAt ? `Finished ${formatDateTime(job.completedAt)}` : 'Finished'}
            {job.committedBy ? ` · imported by ${job.committedBy.displayName}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SummaryCards
            items={[
              { label: 'Rows read', value: c.total },
              { label: 'Created', value: c.created, tone: 'success' },
              { label: 'Updated', value: c.updated, tone: 'success' },
              { label: 'Skipped', value: c.skipped },
              { label: 'Errors', value: c.errors, tone: 'danger' },
              { label: 'Warnings', value: c.warnings, tone: 'warning' },
              { label: 'Imported', value: c.imported },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/students">View students</Link>
            </Button>
            {canSeeAccounts && c.imported > 0 && (
              <Button asChild variant="outline">
                <Link href={`/admin/student-accounts?import=${job.id}`}>
                  Student portal activation codes
                </Link>
              </Button>
            )}
            <ReportButton job={job} />
          </div>
        </CardContent>
      </Card>
      <RowsSection
        importId={job.id}
        filters={[
          { value: 'all', label: 'All', count: c.total },
          { value: 'imported', label: 'Imported', count: c.imported },
          { value: 'errors', label: 'Errors', count: c.errors },
          { value: 'warnings', label: 'Warnings', count: c.warnings },
        ]}
      />
    </div>
  );
}

function FailedPanel({ job, canRun }: { job: ImportJob; canRun: boolean }) {
  const retry = useImportStep(job.id, () => importsApi.retry(job.id));
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-danger/40">
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2 text-card-title">
              <AlertTriangleIcon aria-hidden="true" className="size-5 text-danger" />
              Import failed
            </h2>
          </CardTitle>
          <CardDescription role="alert">
            {job.failure?.message ?? 'The import could not be completed.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {job.failure?.retryable ? (
            canRun && (
              <div>
                <Button
                  disabled={retry.isPending}
                  onClick={() => {
                    retry.mutate(undefined);
                  }}
                >
                  {retry.isPending ? (
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                  ) : (
                    <RefreshCwIcon aria-hidden="true" />
                  )}
                  Retry
                </Button>
                <p className="mt-2 text-meta">
                  Retrying is safe: rows already imported are never imported twice.
                </p>
              </div>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Correct the workbook and start a new import.
              </p>
              {canRun && (
                <Button asChild variant="outline">
                  <Link href="/admin/imports/new">Start a new import</Link>
                </Button>
              )}
            </div>
          )}
          {retry.error && (
            <p role="alert" className="text-sm text-danger-text">
              {errorMessage(retry.error)}
            </p>
          )}
        </CardContent>
      </Card>
      {job.counts.total > 0 && (
        <RowsSection
          importId={job.id}
          filters={[
            { value: 'all', label: 'All', count: job.counts.total },
            { value: 'imported', label: 'Imported', count: job.counts.imported },
            { value: 'errors', label: 'Errors', count: job.counts.errors },
          ]}
        />
      )}
    </div>
  );
}

function CancelButton({ job }: { job: ImportJob }) {
  const [open, setOpen] = useState(false);
  const cancel = useImportStep(job.id, () => importsApi.cancel(job.id));
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <XCircleIcon aria-hidden="true" />
        Cancel import
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this import?</DialogTitle>
            <DialogDescription>
              Nothing has been imported yet. A cancelled import cannot be resumed.
            </DialogDescription>
          </DialogHeader>
          {cancel.error && (
            <p role="alert" className="text-sm text-danger-text">
              {errorMessage(cancel.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
            >
              Keep import
            </Button>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                  },
                });
              }}
            >
              Cancel import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ImportDetailView({ importId }: { importId: string }) {
  const query = useImportJob(importId);
  const canRun = useCan(PERMISSIONS.importsStudentsRun);
  const client = useQueryClient();
  const status = query.data?.status;
  useSetBreadcrumbLabel(query.data?.originalFilename);
  // When the worker moves the import to a new state, row data (statuses, issues) changes too.
  useEffect(() => {
    if (status) void client.invalidateQueries({ queryKey: ['imports', 'rows', importId] });
  }, [client, importId, status]);

  if (query.isPending) return <TableSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const job = query.data;
  const badge = IMPORT_STATUS[job.status];

  return (
    <>
      <PageHeader
        title="Student import"
        description={`${job.originalFilename}${job.fileSizeBytes ? ` · ${formatBytes(job.fileSizeBytes)}` : ''} · uploaded ${formatDateTime(job.createdAt)}${job.createdBy ? ` by ${job.createdBy.displayName}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            {canRun && job.actions.cancel && <CancelButton job={job} />}
          </div>
        }
      />
      {stepForStatus(job.status) >= 0 && (
        <ImportStepper current={stepForStatus(job.status)} complete={job.status === 'COMPLETED'} />
      )}
      {job.status === 'UPLOADED' && (
        <WorkingPanel
          job={job}
          title="Reading the workbook"
          description="Checking the file and finding its worksheets and columns."
        />
      )}
      {job.status === 'MAPPING' && <MappingPanel job={job} canRun={canRun} />}
      {job.status === 'VALIDATING' && (
        <WorkingPanel
          job={job}
          title="Validating rows"
          description="Every row is checked against the rules and existing records. Nothing is saved to student records yet."
        />
      )}
      {job.status === 'VALIDATED' && <ReviewPanel job={job} canRun={canRun} />}
      {job.status === 'PROCESSING' && (
        <WorkingPanel
          job={job}
          title="Importing"
          description="Valid rows are being written in batches."
        />
      )}
      {job.status === 'COMPLETED' && <CompletedPanel job={job} />}
      {job.status === 'FAILED' && <FailedPanel job={job} canRun={canRun} />}
      {job.status === 'CANCELLED' && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-card-title">Import cancelled</h2>
            </CardTitle>
            <CardDescription>
              {job.cancelledAt ? `Cancelled ${formatDateTime(job.cancelledAt)}. ` : ''}Nothing from
              this file was imported.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}
