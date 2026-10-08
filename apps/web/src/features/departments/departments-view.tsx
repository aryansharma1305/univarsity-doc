'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import type { Department } from '@docversity/validation';
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
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDepartments, useSaveDepartment } from './api';
import { DepartmentDialog } from './department-dialog';

const STATUS_FILTER = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

export function DepartmentsView() {
  const canWrite = useCan(PERMISSIONS.departmentsWrite);
  const { values, page, update } = useListParams(['status'] as const);
  const query = useDepartments({
    page,
    search: values.search || undefined,
    status: (values.status || undefined) as Department['status'] | undefined,
  });
  const save = useSaveDepartment();
  const [dialog, setDialog] = useState<{ open: boolean; department?: Department }>({ open: false });

  async function toggleStatus(department: Department) {
    const status = department.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await save.mutateAsync({ id: department.id, body: { status } });
      toast.success(
        `Department ${department.code} ${status === 'ACTIVE' ? 'activated' : 'deactivated'}`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const actionsFor = (department: Department) =>
    canWrite
      ? [
          {
            label: 'Edit',
            onSelect: () => {
              setDialog({ open: true, department });
            },
          },
          {
            label: department.status === 'ACTIVE' ? 'Deactivate' : 'Activate',
            onSelect: () => void toggleStatus(department),
          },
        ]
      : [];

  const columns: ColumnDef<Department>[] = [
    {
      header: 'Code',
      cell: ({ row }) => <span className="font-medium text-navy-950">{row.original.code}</span>,
    },
    { header: 'Name', accessorKey: 'name' },
    {
      header: 'Programs',
      cell: ({ row }) => <span className="tabular">{row.original.programCount}</span>,
    },
    { header: 'Status', cell: ({ row }) => <RecordStatus status={row.original.status} /> },
    {
      header: 'Last updated',
      cell: ({ row }) => (
        <span className="text-meta">{formatDateTime(row.original.updatedAt)}</span>
      ),
    },
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
        title="Departments"
        description="Academic departments that programs can belong to."
        actions={
          canWrite && (
            <Button
              onClick={() => {
                setDialog({ open: true });
              }}
            >
              <PlusIcon aria-hidden="true" />
              Add department
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput
          label="Search departments"
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
          options={STATUS_FILTER}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No departments match these filters' : 'No departments yet'}
          description={
            filtered ? 'Try a different search or status.' : 'Departments you add will appear here.'
          }
          action={
            !filtered && canWrite ? (
              <Button
                onClick={() => {
                  setDialog({ open: true });
                }}
              >
                Add department
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            caption="Departments"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(department) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy-950">{department.code}</p>
                  <p className="truncate text-sm">{department.name}</p>
                  <p className="text-meta">{department.programCount} programs</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <RecordStatus status={department.status} />
                  <RowActions
                    label={`Actions for ${department.code}`}
                    actions={actionsFor(department)}
                  />
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
      <DepartmentDialog
        open={dialog.open}
        department={dialog.department}
        onOpenChange={(open) => {
          setDialog((state) => ({ ...state, open }));
        }}
      />
    </>
  );
}
