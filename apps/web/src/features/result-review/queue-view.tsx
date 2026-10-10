'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@docversity/types';
import { reviewQuerySchema, reviewStates } from '@docversity/validation';
import { Button } from '@docversity/ui/components/button';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { ContextSelect } from '@/features/result-imports/new-preview-view';
import { curriculaApi } from '@/features/curricula/api';
import { useListParams } from '@/hooks/use-list-params';
import { resultReviewApi } from './api';
const FILTERS = [
  'programId',
  'curriculumId',
  'academicSessionId',
  'periodNumber',
  'examinationId',
  'programSubjectId',
  'status',
] as const;
export function ResultReviewQueueView() {
  const canRead = useCan(PERMISSIONS.resultsRead);
  const { values, page, update } = useListParams(FILTERS);
  const parsed = reviewQuerySchema.safeParse({
    ...Object.fromEntries(FILTERS.filter((key) => values[key]).map((key) => [key, values[key]])),
    page,
    pageSize: 25,
  });
  const filters = parsed.success ? parsed.data : { page: 1, pageSize: 25 };
  const options = useQuery({
    queryKey: ['result-review-contexts'],
    queryFn: resultReviewApi.contexts,
    enabled: canRead,
  });
  const query = useQuery({
    queryKey: ['result-review', filters],
    queryFn: () => resultReviewApi.list(filters),
    enabled: canRead,
  });
  const curriculumQuery = useQuery({
    queryKey: ['review-curriculum', filters.curriculumId],
    queryFn: () => {
      if (!filters.curriculumId) throw Error('Select a curriculum.');
      return curriculaApi.get(filters.curriculumId);
    },
    enabled: canRead && !!filters.curriculumId,
  });
  const set = (key: (typeof FILTERS)[number], value: string) => {
    update({
      [key]: value === 'ALL' ? '' : value,
      ...(key === 'programId'
        ? {
            curriculumId: '',
            periodNumber: '',
            academicSessionId: '',
            examinationId: '',
            programSubjectId: '',
          }
        : {}),
      ...(key === 'curriculumId'
        ? { periodNumber: '', academicSessionId: '', examinationId: '', programSubjectId: '' }
        : {}),
      ...(key === 'periodNumber' ? { examinationId: '', programSubjectId: '' } : {}),
      ...(key === 'academicSessionId' ? { examinationId: '' } : {}),
    });
  };
  const programs = options.data?.programs ?? [],
    curricula = programs.find((p) => p.id === filters.programId)?.curricula ?? [],
    curriculum = curricula.find((c) => c.id === filters.curriculumId),
    exams = (curriculum?.examinations ?? []).filter(
      (e) => !filters.periodNumber || e.period.number === filters.periodNumber,
    );
  const sessions = [
    ...new Map(exams.map((e) => [e.academicSession.id, e.academicSession])).values(),
  ];
  const subjects = (curriculumQuery.data?.periods ?? [])
    .filter((p) => !filters.periodNumber || p.number === filters.periodNumber)
    .flatMap((p) => p.subjects);
  const all = (label: string, items: { value: string; label: string }[]) => [
    { value: 'ALL', label: `All ${label}` },
    ...items,
  ];
  if (!canRead) return <ForbiddenState />;
  return (
    <>
      <PageHeader
        title="Result review"
        description="Review complete marks versions. Approval is separate from publication."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/results">Draft marks</Link>
          </Button>
        }
      />
      {!parsed.success && (
        <p role="alert">
          Invalid queue filters.{' '}
          <Button
            variant="outline"
            onClick={() => {
              update(Object.fromEntries(FILTERS.map((key) => [key, ''])));
            }}
          >
            Clear filters
          </Button>
        </p>
      )}
      {options.isError ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : (
        <section
          aria-label="Result queue filters"
          className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <ContextSelect
            label="Course"
            value={filters.programId ?? 'ALL'}
            options={all(
              'courses',
              programs.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
            )}
            onChange={(v) => {
              set('programId', v);
            }}
          />
          <ContextSelect
            label="Curriculum"
            value={filters.curriculumId ?? 'ALL'}
            options={all(
              'curricula',
              curricula.map((c) => ({ value: c.id, label: `${c.versionCode} · ${c.name}` })),
            )}
            onChange={(v) => {
              set('curriculumId', v);
            }}
          />
          <ContextSelect
            label="Semester / year"
            value={filters.periodNumber ? String(filters.periodNumber) : 'ALL'}
            options={all(
              'periods',
              (curriculum?.periods ?? []).map((p) => ({ value: String(p.number), label: p.label })),
            )}
            onChange={(v) => {
              set('periodNumber', v);
            }}
          />
          <ContextSelect
            label="Academic session"
            value={filters.academicSessionId ?? 'ALL'}
            options={all(
              'sessions',
              sessions.map((s) => ({ value: s.id, label: s.name })),
            )}
            onChange={(v) => {
              set('academicSessionId', v);
            }}
          />
          <ContextSelect
            label="Examination"
            value={filters.examinationId ?? 'ALL'}
            options={all(
              'examinations',
              exams
                .filter(
                  (e) =>
                    !filters.academicSessionId ||
                    e.academicSession.id === filters.academicSessionId,
                )
                .map((e) => ({ value: e.id, label: `${e.code} · ${e.name}` })),
            )}
            onChange={(v) => {
              set('examinationId', v);
            }}
          />
          <ContextSelect
            label="Subject"
            value={filters.programSubjectId ?? 'ALL'}
            options={all(
              'subjects',
              subjects.map((s) => ({
                value: s.id,
                label: `${s.subject.code} · ${s.subject.name}`,
              })),
            )}
            onChange={(v) => {
              set('programSubjectId', v);
            }}
          />
          <ContextSelect
            label="Result status"
            value={filters.status ?? 'ALL'}
            options={all(
              'statuses',
              reviewStates.map((s) => ({ value: s, label: s.replaceAll('_', ' ') })),
            )}
            onChange={(v) => {
              set('status', v);
            }}
          />
        </section>
      )}
      <div className="mt-6">
        {query.isPending ? (
          <TableSkeleton />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No results in this queue"
            description="Change the filters or enter draft marks for an eligible student."
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {query.data.meta.total} {query.data.meta.total === 1 ? 'result' : 'results'} · Page{' '}
              {filters.page} of {query.data.meta.totalPages}
            </p>
            <section
              aria-label="Results awaiting review"
              className="divide-y rounded-lg border bg-card"
            >
              {query.data.items.map((r) => (
                <article
                  key={r.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <h2 className="font-medium break-words">
                      {r.registrationNumber} · {r.studentName}
                    </h2>
                    <p className="text-sm break-words">
                      {r.examinationName} · {r.structure === 'YEAR_WISE' ? 'Year' : 'Semester'}{' '}
                      {r.periodNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {r.status.replaceAll('_', ' ')} · Attempt {r.attemptNumber} · Version{' '}
                      {r.version} · {r.issues.length} issues
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/admin/results/review/${r.id}`}>Review marks</Link>
                  </Button>
                </article>
              ))}
            </section>
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                disabled={filters.page === 1}
                onClick={() => {
                  update({ page: page - 1 });
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={filters.page >= query.data.meta.totalPages}
                onClick={() => {
                  update({ page: page + 1 });
                }}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
