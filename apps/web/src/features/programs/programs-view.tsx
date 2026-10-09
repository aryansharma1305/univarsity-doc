'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import type { Program } from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { RowActions } from '@/components/data/row-actions';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { RecordStatus } from '@/components/data/status';
import { useCan } from '@/components/providers/session-context';
import { useDepartments } from '@/features/departments/api';
import { useListParams } from '@/hooks/use-list-params';
import { errorMessage } from '@/lib/api';
import { structureLabel } from '@/features/curricula/labels';
import { usePrograms, useSaveProgram } from './api';
import { ProgramDialog } from './program-dialog';

const STATUS_FILTER = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

export function ProgramsView() {
  const router = useRouter();
  const canWrite = useCan(PERMISSIONS.programsWrite);
  const { values, page, update } = useListParams(['status', 'department'] as const);
  const query = usePrograms({
    page,
    search: values.search || undefined,
    status: (values.status || undefined) as Program['status'] | undefined,
    departmentId: values.department || undefined,
  });
  const departments = useDepartments({ pageSize: 100, sortBy: 'code' });
  const departmentFilter = (departments.data?.data ?? []).map((d) => ({
    value: d.id,
    label: d.code,
  }));
  const save = useSaveProgram();
  const [dialog, setDialog] = useState<{ open: boolean; program?: Program }>({ open: false });

  async function toggleStatus(program: Program) {
    const status = program.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await save.mutateAsync({ id: program.id, body: { status } });
      toast.success(`Course ${program.code} ${status === 'ACTIVE' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const actionsFor = (program: Program) => [
    {
      label: 'Open course',
      onSelect: () => {
        router.push(`/admin/programs/${program.id}`);
      },
    },
    ...(canWrite
      ? [
          {
            label: 'Edit',
            onSelect: () => {
              setDialog({ open: true, program });
            },
          },
          {
            label: program.status === 'ACTIVE' ? 'Deactivate' : 'Activate',
            onSelect: () => void toggleStatus(program),
          },
        ]
      : []),
  ];

  const columns: ColumnDef<Program>[] = [
    {
      header: 'Code',
      cell: ({ row }) => <span className="font-medium text-navy-950">{row.original.code}</span>,
    },
    {
      header: 'Course',
      cell: ({ row }) => (
        <Link
          href={`/admin/programs/${row.original.id}`}
          className="font-medium text-brand hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      header: 'Department',
      cell: ({ row }) => row.original.department?.code ?? <span className="text-meta">—</span>,
    },
    {
      header: 'Type',
      cell: ({ row }) => row.original.level ?? <span className="text-meta">—</span>,
    },
    {
      header: 'Structure',
      cell: ({ row }) => structureLabel(row.original) ?? <span className="text-meta">Not set</span>,
    },
    {
      header: 'Curricula',
      cell: ({ row }) => <span className="tabular">{row.original.curriculumCount}</span>,
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

  const filtered = Boolean(values.search || values.status || values.department);

  return (
    <>
      <PageHeader
        title="Course Management"
        description="Courses (programs), their academic structure and curriculum versions."
        actions={
          canWrite && (
            <Button
              onClick={() => {
                setDialog({ open: true });
              }}
            >
              <PlusIcon aria-hidden="true" />
              Create course
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search courses"
          placeholder="Search by code or name"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Department"
          allLabel="All departments"
          value={values.department}
          onChange={(department) => {
            update({ department });
          }}
          options={departmentFilter}
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
          title={filtered ? 'No courses match these filters' : 'No courses yet'}
          description={
            filtered ? 'Try a different search or filter.' : 'Courses you create will appear here.'
          }
          action={
            !filtered && canWrite ? (
              <Button
                onClick={() => {
                  setDialog({ open: true });
                }}
              >
                Create course
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            caption="Courses"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(program) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy-950">{program.code}</p>
                  <Link
                    href={`/admin/programs/${program.id}`}
                    className="text-sm font-medium break-words text-brand hover:underline"
                  >
                    {program.name}
                  </Link>
                  <p className="text-meta">
                    {[program.department?.code, program.level, structureLabel(program)]
                      .filter(Boolean)
                      .join(' · ') || 'No department'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <RecordStatus status={program.status} />
                  <RowActions label={`Actions for ${program.code}`} actions={actionsFor(program)} />
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
      <ProgramDialog
        open={dialog.open}
        program={dialog.program}
        onOpenChange={(open) => {
          setDialog((state) => ({ ...state, open }));
        }}
      />
    </>
  );
}
