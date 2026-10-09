'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { StatusBadge } from '@docversity/ui';
import {
  formatMoney,
  PAYMENT_REGION_LABELS,
  PAYMENT_REGIONS,
  type PaymentRegion,
  type ReExamPaymentRow,
  type ReExamPaymentStatus,
} from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useListParams } from '@/hooks/use-list-params';
import { formatDateTime } from '@/lib/format';
import { usePayments } from './api';
import { PAYMENT_STATUS, PAYMENT_STATUS_OPTIONS } from './labels';

export function PaymentStatusBadge({ status }: { status: ReExamPaymentStatus }) {
  return (
    <StatusBadge tone={PAYMENT_STATUS[status].tone}>{PAYMENT_STATUS[status].label}</StatusBadge>
  );
}

const REGION_OPTIONS = PAYMENT_REGIONS.map((value) => ({
  value,
  label: PAYMENT_REGION_LABELS[value],
}));

export function ReExamPaymentsView() {
  const { values, page, update } = useListParams(['status', 'region'] as const);
  const filters = {
    search: values.search || undefined,
    status: (values.status || undefined) as ReExamPaymentStatus | undefined,
    region: (values.region || undefined) as PaymentRegion | undefined,
  };
  const query = usePayments({ ...filters, page, sortOrder: 'desc' });
  const columns: ColumnDef<ReExamPaymentRow>[] = [
    {
      header: 'Payment',
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/admin/re-exam-payments/${row.original.id}`}
            className="font-medium text-brand hover:underline"
          >
            {row.original.application.reference}
          </Link>
          <p className="text-meta">
            {row.original.submittedAt
              ? `Submitted ${formatDateTime(row.original.submittedAt)}`
              : `Started ${formatDateTime(row.original.createdAt)}`}
          </p>
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
      header: 'Subject',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="break-words">{row.original.subject.code}</p>
          <p className="text-meta">attempt {row.original.application.attemptNumber}</p>
        </div>
      ),
    },
    {
      header: 'Amount due',
      cell: ({ row }) => (
        <div>
          <p className="tabular">{formatMoney(row.original.amountMinor, row.original.currency)}</p>
          <p className="text-meta">{PAYMENT_REGION_LABELS[row.original.region]}</p>
        </div>
      ),
    },
    {
      header: 'Reference',
      cell: ({ row }) => (
        <span className="font-mono text-xs break-all">
          {row.original.transactionReference ?? '—'}
        </span>
      ),
    },
    { header: 'Status', cell: ({ row }) => <PaymentStatusBadge status={row.original.status} /> },
  ];
  const filtered = Object.values(filters).some((value) => value !== undefined);
  return (
    <>
      <PageHeader
        title="Re-exam Payments"
        description="Payments students made outside Docversity. A reference or receipt is not proof of payment: verify each one against the university’s account before confirming it."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <SearchInput
          label="Search by student, registration number, subject or transaction reference"
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
          options={PAYMENT_STATUS_OPTIONS}
          allLabel="All statuses"
        />
        <FilterSelect
          label="Country / region"
          value={values.region}
          onChange={(region) => {
            update({ region, page: 1 });
          }}
          options={REGION_OPTIONS}
          allLabel="All regions"
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No payments match these filters' : 'No re-exam payments yet'}
          description={
            filtered
              ? undefined
              : 'Payments appear here when students choose a country/region and submit a transaction reference.'
          }
        />
      ) : (
        <>
          <DataTable
            caption="Re-exam payments"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(p) => (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/admin/re-exam-payments/${p.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {p.application.reference} · {p.student.name}
                </Link>
                <p className="text-sm break-words">
                  {p.registrationNumber} · {p.subject.code} ·{' '}
                  {formatMoney(p.amountMinor, p.currency)} · {PAYMENT_REGION_LABELS[p.region]}
                </p>
                <p className="font-mono text-xs break-all">{p.transactionReference ?? '—'}</p>
                <PaymentStatusBadge status={p.status} />
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
