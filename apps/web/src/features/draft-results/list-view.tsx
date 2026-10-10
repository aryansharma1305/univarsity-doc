'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { draftResultsApi } from './api';
export function DraftResultsListView() {
  const canRead = useCan(PERMISSIONS.resultsRead),
    canWrite = useCan(PERMISSIONS.resultsWrite),
    canImport = useCan(PERMISSIONS.importsResultsRun);
  const query = useQuery({
    queryKey: ['draft-results'],
    queryFn: draftResultsApi.list,
    enabled: canRead,
  });
  if (!canRead) return <ForbiddenState />;
  return (
    <>
      <PageHeader
        title="Draft results"
        description="Internal marks drafts. Review complete marks through the review queue. Draft marks are not visible to students."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/results/review">Review queue</Link>
            </Button>
            {canWrite && (
              <Button asChild>
                <Link href="/admin/results/new">Enter marks</Link>
              </Button>
            )}
            {canImport && (
              <Button asChild variant="outline">
                <Link href="/admin/results/import">Import workbook</Link>
              </Button>
            )}
          </>
        }
      />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="No saved drafts"
          description="Select an examination and an enrolled student to enter marks."
        />
      ) : (
        <section
          className="divide-y rounded-lg border bg-card"
          aria-label="Latest 200 draft subjects"
        >
          {query.data.items.map((d) => (
            <article
              key={d.id}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h2 className="font-medium break-words">
                  {d.registrationNumber} · {d.studentName}
                </h2>
                <p className="text-sm break-words">
                  {d.subjectCode} · {d.subjectName} · {d.examinationName}
                </p>
                <p className="text-meta">
                  DRAFT · Attempt {d.attemptNumber} · Version {d.version} · {d.issues.length}{' '}
                  validation issues
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/admin/results/${d.id}`}>Open draft</Link>
              </Button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
