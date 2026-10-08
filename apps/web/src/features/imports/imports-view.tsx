'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import type { ImportJobSummary, ImportStatus } from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { useListParams } from '@/hooks/use-list-params';
import { formatDateTime } from '@/lib/format';
import { useImportCreators, useImports } from './api';
import { formatCount, IMPORT_STATUS, IMPORT_STATUS_OPTIONS } from './labels';

function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return <StatusBadge tone={IMPORT_STATUS[status].tone}>{IMPORT_STATUS[status].label}</StatusBadge>;
}

function NumberCell({ value, tone }: { value: number; tone?: 'warning' | 'danger' }) {
  const color =
    value > 0 && tone === 'danger'
      ? 'text-danger-text'
      : value > 0 && tone === 'warning'
        ? 'text-warning-text'
        : 'text-navy-950';
  return <span className={`tabular ${color}`}>{formatCount(value)}</span>;
}

export function ImportsView() {
  const canRun = useCan(PERMISSIONS.importsStudentsRun);
  const { values, page, update } = useListParams(['status', 'creator', 'from', 'to'] as const);
  const query = useImports({
    page,
    status: (values.status || undefined) as ImportStatus | undefined,
    createdById: values.creator || undefined,
    from: values.from || undefined,
    to: values.to || undefined,
  });
  const creators = useImportCreators();
  const filtered = Boolean(values.status || values.creator || values.from || values.to);

  const columns: ColumnDef<ImportJobSummary>[] = [
    {
      header: 'File',
      cell: ({ row }) => (
        <Link
          href={`/admin/imports/${row.original.id}`}
          className="font-medium break-all text-brand hover:underline"
        >
          {row.original.originalFilename}
        </Link>
      ),
    },
    { header: 'Type', cell: () => 'Students' },
    { header: 'Created by', cell: ({ row }) => row.original.createdBy?.displayName ?? '—' },
    {
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-meta">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    { header: 'Status', cell: ({ row }) => <ImportStatusBadge status={row.original.status} /> },
    { header: 'Rows', cell: ({ row }) => <NumberCell value={row.original.totalRows} /> },
    { header: 'Imported', cell: ({ row }) => <NumberCell value={row.original.importedRows} /> },
    {
      header: 'Warnings',
      cell: ({ row }) => <NumberCell value={row.original.warningRows} tone="warning" />,
    },
    {
      header: 'Errors',
      cell: ({ row }) => <NumberCell value={row.original.errorRows} tone="danger" />,
    },
  ];

  const newImport = canRun && (
    <Button asChild>
      <Link href="/admin/imports/new">
        <PlusIcon aria-hidden="true" />
        Import students
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Imports"
        description="Student imports from Excel workbooks, with their validation results."
        actions={newImport}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <FilterSelect
          label="Status"
          allLabel="All statuses"
          value={values.status}
          onChange={(status) => {
            update({ status });
          }}
          options={IMPORT_STATUS_OPTIONS}
        />
        <FilterSelect
          label="Created by"
          allLabel="Anyone"
          value={values.creator}
          onChange={(creator) => {
            update({ creator });
          }}
          options={(creators.data?.data ?? []).map((user) => ({
            value: user.id,
            label: user.displayName,
          }))}
        />
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="imports-from" className="text-meta">
              From
            </Label>
            <Input
              id="imports-from"
              type="date"
              className="h-10 bg-card"
              value={values.from}
              onChange={(event) => {
                update({ from: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="imports-to" className="text-meta">
              To
            </Label>
            <Input
              id="imports-to"
              type="date"
              className="h-10 bg-card"
              value={values.to}
              onChange={(event) => {
                update({ to: event.target.value });
              }}
            />
          </div>
        </div>
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No imports match these filters' : 'No student imports yet'}
          description={
            filtered
              ? 'Try a different status, person or date range.'
              : 'Import many students at once from an Excel workbook. Every row is validated before anything is saved.'
          }
          action={!filtered ? newImport || undefined : undefined}
        />
      ) : (
        <>
          <DataTable
            caption="Imports"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(job) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/admin/imports/${job.id}`}
                    className="min-w-0 font-medium break-all text-brand hover:underline"
                  >
                    {job.originalFilename}
                  </Link>
                  <ImportStatusBadge status={job.status} />
                </div>
                <p className="text-meta">
                  Students · {job.createdBy?.displayName ?? '—'} · {formatDateTime(job.createdAt)}
                </p>
                <dl className="grid grid-cols-4 gap-2 text-sm">
                  {[
                    ['Rows', job.totalRows],
                    ['Imported', job.importedRows],
                    ['Warnings', job.warningRows],
                    ['Errors', job.errorRows],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-meta">{label}</dt>
                      <dd className="tabular text-navy-950">{formatCount(Number(value))}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          />
          <Pagination
            meta={query.data.meta}
            onPageChange={(next) => {
              update({ page: next });
            }}
          />
        </>
      )}
    </>
  );
}
