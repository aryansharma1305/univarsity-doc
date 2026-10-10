'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@docversity/types';
import { DRAFT_MARK_FIELDS, type ReviewAction } from '@docversity/validation';
import { Button } from '@docversity/ui/components/button';
import { Textarea } from '@docversity/ui/components/textarea';
import { Label } from '@docversity/ui/components/label';
import { PageHeader } from '@/components/data/page-header';
import { ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { resultReviewApi } from './api';
const labels = {
  internalMarks: 'Internal',
  externalMarks: 'External',
  practicalMarks: 'Practical',
  otherMarks: 'Other',
  totalMarks: 'Entered total',
};
type Action = 'submit' | 'return' | 'reject' | 'approve';
export function ResultReviewDetailView({ id }: { id: string }) {
  const canRead = useCan(PERMISSIONS.resultsRead),
    canWrite = useCan(PERMISSIONS.resultsWrite),
    canCheck = useCan(PERMISSIONS.resultsReview),
    canApprove = useCan(PERMISSIONS.resultsApprove);
  const [selectedVersion, setSelectedVersion] = useState('');
  const versionQuery = useQuery({
    queryKey: ['review-version', id, selectedVersion],
    queryFn: () => resultReviewApi.version(id, selectedVersion),
    enabled: canRead && !!selectedVersion,
  });
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['result-review-detail', id],
    queryFn: () => resultReviewApi.get(id),
    enabled: canRead,
  });
  const [confirmed, setConfirmed] = useState(false),
    [reason, setReason] = useState('');
  const pending = useRef<{ key: string; body: ReviewAction } | null>(null);
  const mutation = useMutation({
    mutationFn: (action: Action) => {
      const version = query.data?.version;
      if (!version) throw Error('Reload the result.');
      const values = {
        expectedVersion: version,
        confirmed: true as const,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      const key = JSON.stringify({ id, action, ...values });
      if (pending.current?.key !== key)
        pending.current = { key, body: { ...values, requestId: crypto.randomUUID() } };
      return resultReviewApi.act(id, action, pending.current.body);
    },
    onSuccess: async () => {
      pending.current = null;
      setConfirmed(false);
      setReason('');
      await client.invalidateQueries({ queryKey: ['result-review'] });
      await query.refetch();
    },
  });
  if (!canRead) return <ForbiddenState />;
  if (query.isPending) return <TableSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const r = query.data;
  const reviewing = r.status === 'UNDER_REVIEW' || r.status === 'APPROVED';
  return (
    <>
      <PageHeader
        title="Review result marks"
        description="Inspect this student's whole examination attempt before acting."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/results/review">Review queue</Link>
          </Button>
        }
      />
      <section aria-label="Result context" className="mb-6 border-b pb-5">
        <h2 className="text-lg font-semibold break-words">
          {r.registrationNumber} · {r.studentName}
        </h2>
        <p className="mt-1 break-words">
          {r.examinationName} · {r.structure === 'YEAR_WISE' ? 'Year' : 'Semester'} {r.periodNumber}
        </p>
        <p className="mt-2 text-sm font-medium">
          {r.status.replaceAll('_', ' ')} · Attempt {r.attemptNumber} · Revision {r.revisionNumber}{' '}
          · Version {r.version}
        </p>
      </section>
      <section aria-labelledby="review-subject-heading">
        <h2 id="review-subject-heading" className="mb-3 text-lg font-semibold">
          Subject marks
        </h2>
        <div className="divide-y rounded-lg border bg-card">
          {r.subjects.map((s) => (
            <article key={s.id} className="p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div>
                  <h3 className="font-medium break-words">
                    {s.subjectCode} · {s.subjectName}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Source:{' '}
                    {s.origin === 'EXCEL'
                      ? 'Excel import'
                      : s.origin === 'MANUAL'
                        ? 'Manual entry'
                        : 'Legacy record'}
                    {s.batchId ? ` · Batch ${s.batchId}` : ''}
                  </p>
                  {s.reExamApplicationId && (
                    <p className="mt-1 text-sm break-all">
                      Approved re-exam application · Attempt {r.attemptNumber}
                    </p>
                  )}
                </div>
                {r.status === 'DRAFT' && canWrite && (
                  <Button asChild variant="outline">
                    <Link href={`/admin/results/${s.id}`}>Correct marks</Link>
                  </Button>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
                {DRAFT_MARK_FIELDS.map((f) => (
                  <div key={f}>
                    <dt className="text-sm text-muted-foreground">{labels[f]}</dt>
                    <dd className="mt-1 font-medium tabular-nums">{s.marks[f] ?? 'Not entered'}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="review-validation-heading" className="mt-6">
        <h2 id="review-validation-heading" className="text-lg font-semibold">
          Validation
        </h2>
        {r.issues.length ? (
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {r.issues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm">
            Marks and eligible subject assignments are complete for this examination attempt. No
            grading outcome has been calculated.
          </p>
        )}
      </section>
      {(r.status === 'DRAFT' && canWrite) || (reviewing && canCheck) ? (
        <section
          aria-labelledby="review-action-heading"
          className="mt-6 rounded-lg border bg-card p-5"
        >
          <h2 id="review-action-heading" className="text-lg font-semibold">
            {r.status === 'DRAFT' ? 'Submit for review' : 'Review decision'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {r.status === 'DRAFT'
              ? 'Submitting locks this marks version until it is returned for correction.'
              : 'A reviewer must differ from every marks author/editor and the submitter. Approval never publishes marks.'}
          </p>
          {reviewing && !r.policy.approvalEnabled ? (
            <p className="mt-3 text-sm">{r.policy.approvalBlockers.join(' ')}</p>
          ) : (
            <>
              <div className="mt-4 space-y-2">
                <Label htmlFor="review-reason">
                  Correction or rejection reason{' '}
                  {reviewing ? '(required to return or reject)' : '(optional)'}
                </Label>
                <Textarea
                  id="review-reason"
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </div>
              <div className="mt-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  id="review-confirm"
                  checked={confirmed}
                  onChange={(event) => {
                    setConfirmed(event.target.checked);
                  }}
                />
                <Label htmlFor="review-confirm" className="leading-5">
                  I have reviewed the marks and context for version {r.version} and confirm this
                  action.
                </Label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {r.status === 'DRAFT' ? (
                  <Button
                    disabled={!confirmed || !!r.issues.length || mutation.isPending}
                    onClick={() => {
                      mutation.mutate('submit');
                    }}
                  >
                    Submit for review
                  </Button>
                ) : (
                  <>
                    {r.status === 'UNDER_REVIEW' && canApprove && (
                      <Button
                        disabled={!confirmed || !!r.issues.length || mutation.isPending}
                        onClick={() => {
                          mutation.mutate('approve');
                        }}
                      >
                        Approve reviewed version
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={!confirmed || !reason.trim() || mutation.isPending}
                      onClick={() => {
                        mutation.mutate('return');
                      }}
                    >
                      Return for correction
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!confirmed || !reason.trim() || mutation.isPending}
                      onClick={() => {
                        mutation.mutate('reject');
                      }}
                    >
                      Reject reviewed version
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
          {mutation.isError && (
            <div className="mt-4">
              <ErrorState error={mutation.error} onRetry={() => void query.refetch()} />
            </div>
          )}
        </section>
      ) : null}
      <section
        aria-labelledby="publication-heading"
        className="mt-6 rounded-lg border bg-muted/30 p-5"
      >
        <h2 id="publication-heading" className="font-semibold">
          Publication configuration required
        </h2>
        <p className="mt-2 text-sm">
          Publication is disabled. These marks remain unavailable to students, including after
          approval.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {r.policy.publicationBlockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>
      {selectedVersion && (
        <section aria-label="Saved marks version" className="mt-6 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">
            Saved marks version {versionQuery.data?.version ?? ''}
          </h2>
          {versionQuery.isPending ? (
            <TableSkeleton />
          ) : versionQuery.isError ? (
            <ErrorState error={versionQuery.error} onRetry={() => void versionQuery.refetch()} />
          ) : (
            versionQuery.data.subjects.map((s) => (
              <div key={s.id} className="mt-4">
                <h3 className="font-medium">
                  {s.subjectCode} · {s.subjectName}
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {DRAFT_MARK_FIELDS.map((field) => (
                    <div key={field}>
                      <dt className="text-sm text-muted-foreground">{labels[field]}</dt>
                      <dd className="tabular-nums">{s.marks[field] ?? 'Not entered'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          )}
        </section>
      )}
      <section aria-labelledby="review-history-heading" className="mt-6">
        <h2 id="review-history-heading" className="text-lg font-semibold">
          Review history
        </h2>
        {r.history.length ? (
          <ol className="mt-3 divide-y rounded-lg border bg-card">
            {r.history.map((h) => (
              <li key={h.id} className="p-5">
                <p className="font-medium">
                  {h.action} · {h.fromStatus.replaceAll('_', ' ')} →{' '}
                  {h.toStatus.replaceAll('_', ' ')}
                </p>
                <p className="mt-1 text-sm">
                  {h.actorName} · {new Date(h.createdAt).toLocaleString()} · Version {h.version}
                </p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setSelectedVersion(h.id);
                  }}
                >
                  View marks from version {h.version}
                </Button>
                {h.reason && <p className="mt-2 text-sm break-words">Reason: {h.reason}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            This result has not been submitted for review.
          </p>
        )}
      </section>
    </>
  );
}
