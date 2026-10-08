'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import type { AcademicSession } from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { RowActions } from '@/components/data/row-actions';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { RecordStatus } from '@/components/data/status';
import { useCan } from '@/components/providers/session-context';
import { useListParams } from '@/hooks/use-list-params';
import { formatDate } from '@/lib/format';
import { useAcademicSessions } from './api';
import { SESSION_STATUS_OPTIONS, SessionDialog } from './session-dialog';

function dateRange(session: AcademicSession): string {
  if (!session.startsOn && !session.endsOn) return '—';
  return `${formatDate(session.startsOn)} – ${formatDate(session.endsOn)}`;
}

export function SessionsView() {
  const canWrite = useCan(PERMISSIONS.academicSessionsWrite);
  const { values, page, update } = useListParams(['status'] as const);
  const query = useAcademicSessions({
    page,
    search: values.search || undefined,
    status: (values.status || undefined) as AcademicSession['status'] | undefined,
    sortBy: 'startsOn',
    sortOrder: 'desc',
  });
  const [dialog, setDialog] = useState<{ open: boolean; session?: AcademicSession }>({
    open: false,
  });

  const actionsFor = (session: AcademicSession) =>
    canWrite
      ? [
          {
            label: 'Edit (incl. status)',
            onSelect: () => {
              setDialog({ open: true, session });
            },
          },
        ]
      : [];

  const columns: ColumnDef<AcademicSession>[] = [
    {
      header: 'Session',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-navy-950">{row.original.name}</p>
          <p className="text-meta">{row.original.code}</p>
        </div>
      ),
    },
    {
      header: 'Dates',
      cell: ({ row }) => <span className="tabular">{dateRange(row.original)}</span>,
    },
    {
      header: 'Registrations',
      cell: ({ row }) => <span className="tabular">{row.original.registrationCount}</span>,
    },
    { header: 'Status', cell: ({ row }) => <RecordStatus status={row.original.status} /> },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowActions label={`Actions for ${row.original.code}`} actions={actionsFor(row.original)} />
      ),
    },
  ];

  const filtered = Boolean(values.search || values.status);

  return (
    <>
      <PageHeader
        title="Academic Sessions"
        description="Admission sessions / batches that registrations belong to."
        actions={
          canWrite && (
            <Button
              onClick={() => {
                setDialog({ open: true });
              }}
            >
              <PlusIcon aria-hidden="true" />
              Add session
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput
          label="Search sessions"
          placeholder="Search by code or name"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Status"
          allLabel="All statuses"
          value={values.status}
          onChange={(status) => {
            update({ status });
          }}
          options={SESSION_STATUS_OPTIONS}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No sessions match these filters' : 'No academic sessions yet'}
          description={
            filtered ? 'Try a different search or status.' : 'Sessions you add will appear here.'
          }
          action={
            !filtered && canWrite ? (
              <Button
                onClick={() => {
                  setDialog({ open: true });
                }}
              >
                Add session
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            caption="Academic sessions"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(session) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy-950">{session.name}</p>
                  <p className="text-meta">
                    {session.code} · {dateRange(session)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <RecordStatus status={session.status} />
                  <RowActions label={`Actions for ${session.code}`} actions={actionsFor(session)} />
                </div>
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
      <SessionDialog
        open={dialog.open}
        session={dialog.session}
        onOpenChange={(open) => {
          setDialog((state) => ({ ...state, open }));
        }}
      />
    </>
  );
}
