'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { CameraIcon } from 'lucide-react';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  PROFILE_FIELD_LABELS,
  type ProfileRequestRow,
  type ProfileRequestStatus,
} from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useListParams } from '@/hooks/use-list-params';
import { formatDateTime } from '@/lib/format';
import { useProfileRequests } from './api';
import { PROFILE_REQUEST_STATUS, PROFILE_REQUEST_STATUS_OPTIONS } from './labels';

export function ProfileRequestStatusBadge({ status }: { status: ProfileRequestStatus }) {
  const { label, tone } = PROFILE_REQUEST_STATUS[status];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function Requested({ row }: { row: ProfileRequestRow }) {
  const parts = row.fields.map((field) => PROFILE_FIELD_LABELS[field]);
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      {parts.join(', ')}
      {row.hasPhoto && (
        <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-navy-950">
          <CameraIcon aria-hidden="true" className="size-3" />
          Photo
        </span>
      )}
    </span>
  );
}

export function ProfileRequestsView() {
  const { values, page, update } = useListParams(['status'] as const);
  const status = (values.status || undefined) as ProfileRequestStatus | undefined;
  const query = useProfileRequests({
    page,
    search: values.search || undefined,
    status,
    // The review queue is worked oldest first; history is read newest first.
    sortOrder: status === 'PENDING' ? 'asc' : 'desc',
  });

  const columns: ColumnDef<ProfileRequestRow>[] = [
    {
      header: 'Student',
      cell: ({ row }) => (
        <Link
          href={`/admin/profile-requests/${row.original.id}`}
          className="font-medium text-brand hover:underline"
        >
          {row.original.student.fullName}
        </Link>
      ),
    },
    {
      header: 'Registration number',
      cell: ({ row }) => (
        <span className="tabular">{row.original.registrationNumbers.join(', ') || '—'}</span>
      ),
    },
    { header: 'Requested', cell: ({ row }) => <Requested row={row.original} /> },
    {
      header: 'Submitted',
      cell: ({ row }) => (
        <span className="text-meta">{formatDateTime(row.original.submittedAt)}</span>
      ),
    },
    {
      header: 'Status',
      cell: ({ row }) => <ProfileRequestStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/admin/profile-requests/${row.original.id}`}
              aria-label={`Review request from ${row.original.student.fullName}`}
            >
              {row.original.status === 'PENDING' ? 'Review' : 'View'}
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  const filtered = Boolean(values.search || values.status);

  return (
    <>
      <PageHeader
        title="Profile requests"
        description="Students’ requests to complete or correct their personal details. Official records change only when a request is approved."
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search requests"
          placeholder="Student name or registration number"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Status"
          allLabel="All statuses"
          value={values.status}
          onChange={(next) => {
            update({ status: next });
          }}
          options={PROFILE_REQUEST_STATUS_OPTIONS}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No requests match these filters' : 'No profile requests yet'}
          description={
            filtered
              ? 'Try a different search or status.'
              : 'Requests students submit from the student portal appear here for review.'
          }
        />
      ) : (
        <>
          <DataTable
            caption="Profile requests"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/profile-requests/${row.id}`}
                      className="font-medium break-words text-brand hover:underline"
                    >
                      {row.student.fullName}
                    </Link>
                    <p className="text-sm break-all tabular">
                      {row.registrationNumbers.join(', ') || 'No registration'}
                    </p>
                  </div>
                  <ProfileRequestStatusBadge status={row.status} />
                </div>
                <Requested row={row} />
                <p className="text-meta">Submitted {formatDateTime(row.submittedAt)}</p>
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
