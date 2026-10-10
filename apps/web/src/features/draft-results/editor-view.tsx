'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import {
  draftMarksSchema,
  DRAFT_MARK_FIELDS,
  type DraftMarks,
  type SavedDraft,
} from '@docversity/validation';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage, ApiError } from '@/lib/api';
import { resultImportsApi } from '@/features/result-imports/api';
import { ContextSelect } from '@/features/result-imports/new-preview-view';
import { draftResultsApi } from './api';
const labels = {
  internalMarks: 'Internal marks',
  externalMarks: 'External marks',
  practicalMarks: 'Practical marks',
  otherMarks: 'Other marks',
  totalMarks: 'Total marks',
};
const blank: DraftMarks = {
  internalMarks: null,
  externalMarks: null,
  practicalMarks: null,
  otherMarks: null,
  totalMarks: null,
};
export function DraftEditorView({ id }: { id?: string }) {
  const canRead = useCan(PERMISSIONS.resultsRead),
    canWrite = useCan(PERMISSIONS.resultsWrite);
  const query = useQuery({
    queryKey: ['draft-result', id],
    queryFn: () => {
      if (!id) throw new Error('Choose a draft.');
      return draftResultsApi.get(id);
    },
    enabled: !!id && canRead,
    retry: false,
  });
  if (!canRead || (!id && !canWrite)) return <ForbiddenState />;
  if (id && query.isPending) return <TableSkeleton />;
  if (id && query.isError)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <DraftEditor key={id ?? 'new'} initial={query.data} canWrite={canWrite} />;
}
function DraftEditor({ initial, canWrite }: { initial?: SavedDraft; canWrite: boolean }) {
  const contexts = useQuery({
    queryKey: ['result-imports', 'context'],
    queryFn: resultImportsApi.contexts,
    enabled: canWrite,
  });
  const [programId, setProgram] = useState(initial?.context.programId ?? '');
  const [curriculumId, setCurriculum] = useState(initial?.context.curriculumId ?? '');
  const [period, setPeriod] = useState(initial ? String(initial.context.periodNumber) : '');
  const [academicSessionId, setSession] = useState(initial?.context.academicSessionId ?? '');
  const [examinationId, setExam] = useState(initial?.examinationId ?? '');
  const [number, setNumber] = useState(initial?.registrationNumber ?? '');
  const [subjectId, setSubject] = useState(initial?.programSubjectId ?? '');
  const [marks, setMarks] = useState<DraftMarks>(initial?.marks ?? blank);
  const [saved, setSaved] = useState(initial);
  const lookup = useMutation({
    mutationFn: () =>
      draftResultsApi.lookup({
        programId,
        curriculumId,
        periodNumber: Number(period),
        academicSessionId,
        examinationId,
        registrationNumber: number,
      }),
    onSuccess: () => {
      if (!initial) {
        setSubject('');
        setSaved(undefined);
        setMarks(blank);
      }
    },
  });
  const context = {
    programId,
    curriculumId,
    periodNumber: Number(period),
    academicSessionId,
    examinationId,
  };
  const subject = lookup.data?.subjects.find((s) => s.id === subjectId);
  const save = useMutation({
    mutationFn: () =>
      draftResultsApi.save({
        context,
        registrationId: lookup.data?.registrationId ?? saved?.registrationId ?? '',
        programSubjectId: subjectId,
        reExamApplicationId: subject?.reExamApplicationId ?? saved?.reExamApplicationId ?? null,
        expectedVersion: saved?.version ?? null,
        marks,
      }),
    onSuccess: (d) => {
      setSaved(d);
      toast.success('Draft saved. No results were published.');
    },
  });
  const history = useQuery({
    queryKey: ['draft-history', saved?.id, saved?.version],
    queryFn: () => {
      if (!saved) throw new Error('Save a draft first.');
      return draftResultsApi.history(saved.id);
    },
    enabled: !!saved,
  });
  const programs = contexts.data?.programs ?? [];
  const curricula = programs.find((p) => p.id === programId)?.curricula ?? [];
  const curriculum = curricula.find((c) => c.id === curriculumId);
  const exams = curriculum?.examinations.filter((e) => e.period.number === Number(period)) ?? [];
  const sessions = [
    ...new Map(exams.map((e) => [e.academicSession.id, e.academicSession])).values(),
  ];
  const fields =
    subject?.components ??
    (initial
      ? DRAFT_MARK_FIELDS.filter((f) => initial.marks[f] !== null).map((field) => ({
          field,
          max: null,
          required: false,
        }))
      : []);
  const chooseSubject = (id: string) => {
    setSubject(id);
    const d = lookup.data?.subjects.find((s) => s.id === id)?.draft;
    setSaved(d ?? undefined);
    setMarks(d?.marks ?? blank);
  };
  const resetContext = () => {
    lookup.reset();
    setSubject('');
    setSaved(undefined);
    setMarks(blank);
    save.reset();
  };
  return (
    <>
      <PageHeader
        title={initial ? 'Saved draft' : 'Enter marks'}
        description="Save internal DRAFT marks, then submit the complete examination attempt for staff review."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/results">Draft results</Link>
          </Button>
        }
      />
      {saved && (
        <Button asChild variant="outline" className="mb-4">
          <Link href={`/admin/results/review/${saved.resultId}`}>Review examination result</Link>
        </Button>
      )}
      {initial ? (
        <p className="mb-6 text-sm">
          {initial.examinationName} · {initial.registrationNumber} · {initial.subjectCode} · Attempt{' '}
          {initial.attemptNumber}
        </p>
      ) : contexts.isPending ? (
        <TableSkeleton />
      ) : contexts.isError ? (
        <ErrorState error={contexts.error} onRetry={() => void contexts.refetch()} />
      ) : (
        <section
          className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Examination context"
        >
          <ContextSelect
            label="Course"
            value={programId}
            options={programs.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
            onChange={(v) => {
              resetContext();
              setProgram(v);
              setCurriculum('');
              setPeriod('');
              setSession('');
              setExam('');
            }}
          />
          <ContextSelect
            label="Curriculum version"
            value={curriculumId}
            options={curricula.map((c) => ({ value: c.id, label: `${c.versionCode} · ${c.name}` }))}
            onChange={(v) => {
              resetContext();
              setCurriculum(v);
              setPeriod('');
              setSession('');
              setExam('');
            }}
          />
          <ContextSelect
            label={curriculum?.structureType === 'YEAR_WISE' ? 'Year' : 'Semester'}
            value={period}
            options={(curriculum?.periods ?? []).map((p) => ({
              value: String(p.number),
              label: p.label,
            }))}
            onChange={(v) => {
              resetContext();
              setPeriod(v);
              setSession('');
              setExam('');
            }}
          />
          <ContextSelect
            label="Academic session"
            value={academicSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => {
              resetContext();
              setSession(v);
              setExam('');
            }}
          />
          <ContextSelect
            label="Examination"
            value={examinationId}
            options={exams
              .filter((e) => e.academicSession.id === academicSessionId)
              .map((e) => ({
                value: e.id,
                label: `${e.code} · ${e.name} · ${e.kind === 'REGULAR' ? 'Regular' : 'Re-examination'}`,
                disabled: !!e.blocker,
              }))}
            onChange={(v) => {
              resetContext();
              setExam(v);
            }}
          />
        </section>
      )}
      {canWrite && (
        <section className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="draft-registration">Registration number</Label>
            <Input
              id="draft-registration"
              value={number}
              readOnly={!!initial}
              onChange={(e) => {
                setNumber(e.target.value);
                resetContext();
              }}
            />
          </div>
          <Button
            variant="outline"
            disabled={!examinationId || !number || lookup.isPending}
            onClick={() => {
              lookup.mutate();
            }}
          >
            {initial ? 'Load applicable components' : 'Find eligible student'}
          </Button>
        </section>
      )}
      {lookup.isError && (
        <div role="alert" className="mb-4 text-sm text-danger-text">
          {errorMessage(lookup.error)}
        </div>
      )}
      {lookup.data && (
        <section className="mb-6 space-y-3">
          <p className="font-medium">
            {lookup.data.registrationNumber} · {lookup.data.studentName}
          </p>
          {lookup.data.subjects.length ? (
            <ContextSelect
              label="Subject"
              value={subjectId}
              options={lookup.data.subjects.map((s) => ({
                value: s.id,
                label: `${s.code} · ${s.name} · Attempt ${s.attemptNumber}`,
              }))}
              onChange={chooseSubject}
            />
          ) : (
            <EmptyState
              title="No eligible subjects"
              description="Check curriculum assignments and approved re-exam applications. Locked results cannot be edited."
            />
          )}
        </section>
      )}
      {(subject ?? initial) && (
        <form
          className="space-y-5 rounded-lg border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="text-section-title">
            {subject?.name ?? initial?.subjectName} · Attempt{' '}
            {subject?.attemptNumber ?? saved?.attemptNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            Leave a missing mark blank. Enter 0 for a zero mark. Required blanks are retained as
            draft validation issues.
          </p>
          {subject?.configurationIssue && (
            <p role="alert" className="text-danger-text">
              {subject.configurationIssue}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(({ field, max, required }) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`draft-${field}`}>
                  {labels[field]}
                  {required ? ' (required before review)' : ''}
                </Label>
                <Input
                  id={`draft-${field}`}
                  inputMode="decimal"
                  value={marks[field] ?? ''}
                  disabled={!canWrite || !subject}
                  onChange={(e) => {
                    setMarks({ ...marks, [field]: e.target.value === '' ? null : e.target.value });
                  }}
                  aria-describedby={`help-${field}`}
                />
                <p id={`help-${field}`} className="text-meta">
                  {max !== null ? `Maximum ${max}. ` : ''}Up to two decimal places.
                </p>
              </div>
            ))}
          </div>
          {save.isError && (
            <div role="alert" className="text-sm text-danger-text">
              <p>{errorMessage(save.error)}</p>
              {save.error instanceof ApiError && (
                <ul>
                  {save.error.details.map((d) => (
                    <li key={d.path}>{d.message}</li>
                  ))}
                </ul>
              )}
              <p>For a version conflict, reload this page before editing again.</p>
            </div>
          )}
          {canWrite && (
            <Button
              type="submit"
              disabled={!subject || !!subject.configurationIssue || save.isPending}
            >
              {save.isPending ? 'Saving draft…' : 'Save as DRAFT'}
            </Button>
          )}
          {saved && (
            <div role="status" className="text-sm">
              <p>DRAFT saved · Version {saved.version} · No results published.</p>
              {saved.issues.length > 0 && (
                <ul className="mt-2 text-warning-text">
                  {saved.issues.map((i) => (
                    <li key={`${i.field}-${i.code}`}>
                      {i.code === 'REQUIRED_COMPONENT_MISSING' && i.field && i.field in labels
                        ? `${labels[i.field as keyof typeof labels]}: missing. Enter before review.`
                        : i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
      {saved && (
        <section className="mt-8 space-y-3">
          <h2 className="text-section-title">Audit history</h2>
          {history.isError ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          ) : (
            history.data?.items.map((event) => (
              <details key={event.id} className="rounded-md border p-3 text-sm">
                <summary>
                  {event.actorName ?? 'Staff'} ·{' '}
                  {event.action === 'RESULT_DRAFT_CREATED' ? 'Created draft' : 'Edited draft'} ·{' '}
                  {new Date(event.createdAt).toLocaleString()}
                </summary>
                <AuditValues metadata={event.metadata} />
              </details>
            ))
          )}
        </section>
      )}
    </>
  );
}

function AuditValues({ metadata }: { metadata: Record<string, unknown> | null }) {
  const before = draftMarksSchema.safeParse(metadata?.previous),
    after = draftMarksSchema.safeParse(metadata?.next);
  return (
    <div className="mt-3 space-y-2">
      <ul className="space-y-1">
        {DRAFT_MARK_FIELDS.map((field) => (
          <li key={field}>
            {labels[field]}:{' '}
            {before.success ? (before.data[field] ?? 'Missing') : 'Not previously saved'} →{' '}
            {after.success ? (after.data[field] ?? 'Missing') : 'Unavailable'}
          </li>
        ))}
      </ul>
      {typeof metadata?.batchId === 'string' && (
        <p className="break-all text-meta">Import batch: {metadata.batchId}</p>
      )}
    </div>
  );
}
