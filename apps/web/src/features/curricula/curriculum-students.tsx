'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import type { AssignCurriculumResult, CurriculumDetail } from '@docversity/validation';
import { FilterSelect } from '@/components/data/filter-select';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { RecordStatus } from '@/components/data/status';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { curriculaApi, useCurriculumMutation, useCurriculumRegistrations } from './api';
import { CURRICULUM_STATUS } from './labels';

const ASSIGNMENT_FILTER = [
  { value: 'unassigned', label: 'No curriculum yet' },
  { value: 'this', label: 'This version' },
  { value: 'other', label: 'Another version' },
] as const;

/**
 * Registrations of the course and the curriculum each follows. Assignment is an explicit staff
 * action, only to an ACTIVE version; moving a registration from another version needs confirmation.
 */
export function CurriculumStudents({ curriculum }: { curriculum: CurriculumDetail }) {
  const canAssign = useCan(PERMISSIONS.studentCurriculaAssign) && curriculum.status === 'ACTIVE';
  const [search, setSearch] = useState('');
  const [assignment, setAssignment] = useState<'' | 'unassigned' | 'this' | 'other'>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(false);
  const [result, setResult] = useState<AssignCurriculumResult | null>(null);
  const query = useCurriculumRegistrations(curriculum.id, {
    page,
    pageSize: 25,
    search: search || undefined,
    assignment: assignment || undefined,
  });
  const assign = useCurriculumMutation(() =>
    curriculaApi.assign(curriculum.id, {
      registrationIds: [...selected],
      replaceExisting: replace,
    }),
  );
  const rows = query.data?.data ?? [];
  const selectedRows = rows.filter((row) => selected.has(row.registrationId));
  const needsReplace = selectedRows.some(
    (row) => row.curriculum !== null && row.curriculum.id !== curriculum.id,
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {curriculum.status === 'ACTIVE'
          ? 'Choose the registrations that follow this version. Nothing is assigned automatically.'
          : curriculum.status === 'DRAFT'
            ? 'Activate this version before assigning students.'
            : 'Archived versions cannot receive new students. Existing assignments are kept.'}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search registrations"
          placeholder="Registration number or name"
          value={search}
          onChange={(next) => {
            setSearch(next);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Curriculum"
          allLabel="All registrations"
          value={assignment}
          onChange={(next) => {
            setAssignment(next as typeof assignment);
            setPage(1);
          }}
          options={ASSIGNMENT_FILTER}
        />
      </div>
      {result && (
        <div role="status" className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <p className="font-medium text-navy-950">
            {result.assigned} registration(s) assigned to {curriculum.versionCode}.
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-foreground/80">
              {result.skipped.map((skip) => (
                <li key={skip.registrationId}>
                  {skip.registrationNumber ?? 'Registration'}: {skip.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No registrations"
          description="No registrations of this course match these filters."
        />
      ) : (
        <>
          <ul
            aria-label="Registrations of this course"
            className="divide-y divide-border rounded-lg border border-border bg-card"
          >
            {rows.map((row) => (
              <li key={row.registrationId} className="flex items-start gap-3 px-4 py-3">
                {canAssign && (
                  <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-brand)]"
                      aria-label={`Select ${row.registrationNumber}`}
                      checked={selected.has(row.registrationId)}
                      disabled={row.curriculum?.id === curriculum.id}
                      onChange={() => {
                        toggle(row.registrationId);
                      }}
                    />
                  </label>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium break-all text-navy-950 tabular">
                      {row.registrationNumber}
                    </p>
                    <p className="text-sm break-words">{row.studentName}</p>
                    <p className="text-meta">{row.academicSession.code}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RecordStatus status={row.status} />
                    {row.curriculum ? (
                      <StatusBadge
                        tone={
                          row.curriculum.id === curriculum.id
                            ? 'success'
                            : CURRICULUM_STATUS[row.curriculum.status].tone
                        }
                      >
                        {row.curriculum.id === curriculum.id
                          ? 'This version'
                          : `Version ${row.curriculum.versionCode}`}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">No curriculum</StatusBadge>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      {canAssign && selected.size > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-raised sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium text-navy-950">{selected.size} selected</p>
            {needsReplace && (
              <label className="mt-1 flex items-center gap-2 text-foreground/80">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-brand)]"
                  checked={replace}
                  onChange={(event) => {
                    setReplace(event.target.checked);
                  }}
                />
                Replace their current version (registrations with results are never moved)
              </label>
            )}
          </div>
          <Button
            disabled={assign.isPending}
            onClick={() => {
              assign.mutate(undefined, {
                onSuccess: (data) => {
                  const outcome = data as AssignCurriculumResult;
                  setResult(outcome);
                  setSelected(new Set());
                  setReplace(false);
                  toast.success(`${String(outcome.assigned)} registration(s) assigned`);
                },
                onError: (error) => {
                  toast.error(errorMessage(error));
                },
              });
            }}
          >
            Assign to {curriculum.versionCode}
          </Button>
        </div>
      )}
    </div>
  );
}
