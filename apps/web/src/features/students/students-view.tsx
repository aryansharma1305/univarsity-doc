'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { FileSpreadsheetIcon, PlusIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import type { StudentListItem, StudentStatus } from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { RecordStatus } from '@/components/data/status';
import { useCan } from '@/components/providers/session-context';
import { useSessionOptions } from '@/features/academic-sessions/api';
import { useProgramOptions } from '@/features/programs/api';
import { useListParams } from '@/hooks/use-list-params';
import { formatDateTime } from '@/lib/format';
import { useStudents } from './api';
import { REGISTRATION_STATUS_OPTIONS } from './options';

function RowLinks({ student, canEdit }: { student: StudentListItem; canEdit: boolean }) {
  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/students/${student.id}`} aria-label={`View ${student.fullName}`}>
          View
        </Link>
      </Button>
      {canEdit && (
        <Button asChild variant="ghost" size="sm">
          <Link
            href={`/admin/students/${student.id}?edit=personal`}
            aria-label={`Edit ${student.fullName}`}
          >
            Edit
          </Link>
        </Button>
      )}
    </div>
  );
}

export function StudentsView() {
  const canEdit = useCan(PERMISSIONS.studentsWrite);
  const canWriteRegistrations = useCan(PERMISSIONS.registrationsWrite);
  const canCreate = canEdit && canWriteRegistrations;
  const canImport = useCan(PERMISSIONS.importsStudentsRun);
  const { values, page, update } = useListParams(['program', 'session', 'status'] as const);
  const query = useStudents({
    page,
    search: values.search || undefined,
    programId: values.program || undefined,
    academicSessionId: values.session || undefined,
    status: (values.status || undefined) as StudentStatus | undefined,
  });
  const programs = useProgramOptions(undefined);
  const sessions = useSessionOptions();
  const programFilter = programs.programs.map((p) => ({ value: p.id, label: p.code }));

  const columns: ColumnDef<StudentListItem>[] = [
    {
      header: 'Registration number',
      cell: ({ row }) => (
        <span className="font-medium text-navy-950 tabular">
          {row.original.latestRegistration?.registrationNumber ?? '—'}
        </span>
      ),
    },
    {
      header: 'Student name',
      cell: ({ row }) => (
        <Link
          href={`/admin/students/${row.original.id}`}
          className="font-medium text-brand hover:underline"
        >
          {row.original.fullName}
        </Link>
      ),
    },
    { header: 'Program', cell: ({ row }) => row.original.latestRegistration?.program.code ?? '—' },
    {
      header: 'Academic session',
      cell: ({ row }) => row.original.latestRegistration?.academicSession.code ?? '—',
    },
    {
      header: 'Status',
      cell: ({ row }) =>
        row.original.latestRegistration ? (
          <RecordStatus status={row.original.latestRegistration.status} />
        ) : (
          '—'
        ),
    },
    {
      header: 'Last updated',
      cell: ({ row }) => (
        <span className="text-meta">{formatDateTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RowLinks student={row.original} canEdit={canEdit} />,
    },
  ];

  const filtered = Boolean(values.search || values.program || values.session || values.status);

  return (
    <>
      <PageHeader
        title="Students"
        description="Students and their registrations."
        actions={
          (canCreate || canImport) && (
            <>
              {canImport && (
                <Button asChild variant="outline">
                  <Link href="/admin/imports/new">
                    <FileSpreadsheetIcon aria-hidden="true" />
                    Import students
                  </Link>
                </Button>
              )}
              {canCreate && (
                <Button asChild>
                  <Link href="/admin/students/new">
                    <PlusIcon aria-hidden="true" />
                    Add student
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search students"
          placeholder="Name or registration number"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Program"
          allLabel="All programs"
          value={values.program}
          onChange={(program) => {
            update({ program });
          }}
          options={programFilter}
        />
        <FilterSelect
          label="Session"
          allLabel="All sessions"
          value={values.session}
          onChange={(session) => {
            update({ session });
          }}
          options={sessions.all}
        />
        <FilterSelect
          label="Status"
          allLabel="All statuses"
          value={values.status}
          onChange={(status) => {
            update({ status });
          }}
          options={REGISTRATION_STATUS_OPTIONS}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No students match these filters' : 'No students yet'}
          description={
            filtered ? 'Try a different search or filter.' : 'Students you add will appear here.'
          }
          action={
            !filtered && canCreate ? (
              <Button asChild>
                <Link href="/admin/students/new">Add student</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            caption="Students"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(student) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {student.fullName}
                    </Link>
                    <p className="text-sm tabular">
                      {student.latestRegistration?.registrationNumber ?? 'No registration'}
                    </p>
                  </div>
                  {student.latestRegistration && (
                    <RecordStatus status={student.latestRegistration.status} />
                  )}
                </div>
                {student.latestRegistration && (
                  <p className="text-meta">
                    {student.latestRegistration.program.code} ·{' '}
                    {student.latestRegistration.academicSession.code}
                  </p>
                )}
                <RowLinks student={student} canEdit={canEdit} />
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
