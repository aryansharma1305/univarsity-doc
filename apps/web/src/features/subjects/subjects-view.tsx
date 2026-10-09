'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import type { Subject, SubjectCategory } from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { RowActions } from '@/components/data/row-actions';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { RecordStatus } from '@/components/data/status';
import { useCan } from '@/components/providers/session-context';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '@/features/curricula/labels';
import { useListParams } from '@/hooks/use-list-params';
import { errorMessage } from '@/lib/api';
import { useSaveSubject, useSubjects } from './api';
import { SubjectDialog } from './subject-dialog';

const STATUS_FILTER = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

export function SubjectsView() {
  const canWrite = useCan(PERMISSIONS.subjectsWrite);
  const { values, page, update } = useListParams(['status', 'category'] as const);
  const query = useSubjects({
    page,
    search: values.search || undefined,
    status: (values.status || undefined) as Subject['status'] | undefined,
    category: (values.category || undefined) as SubjectCategory | undefined,
  });
  const save = useSaveSubject();
  const [dialog, setDialog] = useState<{ open: boolean; subject?: Subject }>({ open: false });

  async function toggleStatus(subject: Subject) {
    const status = subject.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await save.mutateAsync({ id: subject.id, body: { status } });
      toast.success(`Subject ${subject.code} ${status === 'ACTIVE' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const actionsFor = (subject: Subject) =>
    canWrite
      ? [
          {
            label: 'Edit',
            onSelect: () => {
              setDialog({ open: true, subject });
            },
          },
          {
            label: subject.status === 'ACTIVE' ? 'Deactivate' : 'Activate',
            onSelect: () => void toggleStatus(subject),
          },
        ]
      : [];

  const columns: ColumnDef<Subject>[] = [
    {
      header: 'Code',
      cell: ({ row }) => <span className="font-medium text-navy-950">{row.original.code}</span>,
    },
    {
      header: 'Subject',
      cell: ({ row }) => <span className="break-words">{row.original.name}</span>,
    },
    {
      header: 'Category',
      cell: ({ row }) =>
        row.original.category ? (
          CATEGORY_LABELS[row.original.category]
        ) : (
          <span className="text-meta">—</span>
        ),
    },
    {
      header: 'Used in',
      cell: ({ row }) => (
        <span className="tabular">
          {row.original.usageCount} {row.original.usageCount === 1 ? 'curriculum' : 'curricula'}
        </span>
      ),
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

  const filtered = Boolean(values.search || values.status || values.category);

  return (
    <>
      <PageHeader
        title="Subject Catalogue"
        description="Reusable subjects. Credits, marks and placement are set per curriculum."
        actions={
          canWrite && (
            <Button
              onClick={() => {
                setDialog({ open: true });
              }}
            >
              <PlusIcon aria-hidden="true" />
              Add subject
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search subjects"
          placeholder="Search by code or title"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Category"
          allLabel="All categories"
          value={values.category}
          onChange={(category) => {
            update({ category });
          }}
          options={CATEGORY_OPTIONS}
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
          title={filtered ? 'No subjects match these filters' : 'No subjects yet'}
          description={
            filtered
              ? 'Try a different search or filter.'
              : 'Subjects you add can be reused in every course’s curriculum.'
          }
        />
      ) : (
        <>
          <DataTable
            caption="Subjects"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(subject) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy-950">{subject.code}</p>
                  <p className="text-sm break-words">{subject.name}</p>
                  <p className="text-meta">
                    {[
                      subject.category ? CATEGORY_LABELS[subject.category] : null,
                      `Used in ${String(subject.usageCount)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <RecordStatus status={subject.status} />
                  <RowActions label={`Actions for ${subject.code}`} actions={actionsFor(subject)} />
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
      <SubjectDialog
        open={dialog.open}
        subject={dialog.subject}
        onOpenChange={(open) => {
          setDialog((state) => ({ ...state, open }));
        }}
      />
    </>
  );
}
