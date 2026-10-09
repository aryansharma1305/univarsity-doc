'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { DownloadIcon, ReceiptIndianRupeeIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import type { ReExamApplicationRow, ReExamApplicationStatus } from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { useListParams } from '@/hooks/use-list-params';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSessionOptions } from '@/features/academic-sessions/api';
import { useProgramOptions } from '@/features/programs/api';
import { reExamsApi, useReExamApplications } from './api';
import { APPLICATION_STATUS, feeText, STATUS_OPTIONS } from './labels';

export function ApplicationStatusBadge({ status }: { status: ReExamApplicationStatus }) {
  return (
    <StatusBadge tone={APPLICATION_STATUS[status].tone}>
      {APPLICATION_STATUS[status].label}
    </StatusBadge>
  );
}

const PERIOD_OPTIONS = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Semester/Year ${String(index + 1)}`,
}));

export function ReExamApplicationsView() {
  const canManageFees = useCan(PERMISSIONS.reExamFeesManage);
  const programs = useProgramOptions(undefined);
  const sessions = useSessionOptions();
  const [exporting, setExporting] = useState(false);
  const { values, page, update } = useListParams([
    'status',
    'programId',
    'academicSessionId',
    'periodNumber',
  ] as const);
  const filters = {
    search: values.search || undefined,
    status: (values.status || undefined) as ReExamApplicationStatus | undefined,
    programId: values.programId || undefined,
    academicSessionId: values.academicSessionId || undefined,
    periodNumber: values.periodNumber ? Number(values.periodNumber) : undefined,
  };
  const query = useReExamApplications({ ...filters, page, sortOrder: 'desc' });
  const columns: ColumnDef<ReExamApplicationRow>[] = [
    {
      header: 'Application',
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/admin/re-exam-applications/${row.original.id}`}
            className="font-medium text-brand hover:underline"
          >
            {row.original.reference}
          </Link>
          <p className="text-meta">{formatDateTime(row.original.submittedAt)}</p>
        </div>
      ),
    },
    {
      header: 'Student',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="break-words">{row.original.student.name}</p>
          <p className="text-meta tabular">{row.original.registrationNumber}</p>
        </div>
      ),
    },
    {
      header: 'Course · period',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p>{row.original.program.code}</p>
          <p className="text-meta">
            {row.original.periodLabel} · {row.original.academicSessionName}
          </p>
        </div>
      ),
    },
    {
      header: 'Subject',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="break-words">{row.original.subject.name}</p>
          <p className="text-meta">
            {row.original.subject.code} · attempt {row.original.attemptNumber}
          </p>
        </div>
      ),
    },
    {
      header: 'Fee',
      cell: ({ row }) => <span className="text-sm">{feeText(row.original.fee)}</span>,
    },
    {
      header: 'Status',
      cell: ({ row }) => <ApplicationStatusBadge status={row.original.status} />,
    },
  ];
  const filtered = Object.values(filters).some((value) => value !== undefined);
  return (
    <>
      <PageHeader
        title="Re-exam Applications"
        description="Applications submitted by students through the portal. Attempt numbers and fees are recorded by the system; decisions are made here."
        actions={
          <>
            {canManageFees && (
              <Button asChild variant="outline">
                <Link href="/admin/re-exam-applications/fees">
                  <ReceiptIndianRupeeIcon aria-hidden="true" />
                  Fee rules
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              disabled={exporting}
              onClick={() => {
                setExporting(true);
                reExamsApi
                  .exportCsv(filters)
                  .catch((error: unknown) => {
                    toast.error(errorMessage(error));
                  })
                  .finally(() => {
                    setExporting(false);
                  });
              }}
            >
              <DownloadIcon aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <SearchInput
          label="Search by student name or registration number"
          value={values.search}
          onChange={(search) => {
            update({ search, page: 1 });
          }}
        />
        <FilterSelect
          label="Status"
          value={values.status}
          onChange={(status) => {
            update({ status, page: 1 });
          }}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
        />
        <FilterSelect
          label="Course"
          value={values.programId}
          onChange={(programId) => {
            update({ programId, page: 1 });
          }}
          options={programs.options}
          allLabel="All courses"
        />
        <FilterSelect
          label="Batch (academic session)"
          value={values.academicSessionId}
          onChange={(academicSessionId) => {
            update({ academicSessionId, page: 1 });
          }}
          options={sessions.all}
          allLabel="All sessions"
        />
        <FilterSelect
          label="Semester / year"
          value={values.periodNumber}
          onChange={(periodNumber) => {
            update({ periodNumber, page: 1 });
          }}
          options={PERIOD_OPTIONS}
          allLabel="All periods"
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No applications match these filters' : 'No re-exam applications yet'}
          description={
            filtered
              ? undefined
              : 'Students can apply once a re-examination record is open and accepting applications.'
          }
        />
      ) : (
        <>
          <DataTable
            caption="Re-exam applications"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(app) => (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/admin/re-exam-applications/${app.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {app.reference} · {app.student.name}
                </Link>
                <p className="text-sm break-words">
                  {app.registrationNumber} · {app.program.code} · {app.periodLabel}
                </p>
                <p className="text-meta break-words">
                  {app.subject.code} {app.subject.name} · attempt {app.attemptNumber}
                </p>
                <p className="text-sm">{feeText(app.fee)}</p>
                <ApplicationStatusBadge status={app.status} />
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
