'use client';

import Link from 'next/link';
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  CheckCircle2Icon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@docversity/ui/components/tabs';
import { type CurriculumDetail, type CurriculumSubject, periodUnit } from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { EmptyState, ErrorState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { useProgram } from '@/features/programs/api';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { curriculaApi, useCurriculum, useCurriculumMutation } from './api';
import { AssignmentDialog } from './assignment-dialog';
import { CurriculumDialog } from './curriculum-dialog';
import { CurriculumStudents } from './curriculum-students';
import {
  ActivateDialog,
  ArchiveDialog,
  EndDateDialog,
  RemoveAssignmentDialog,
} from './lifecycle-dialogs';
import { CATEGORY_LABELS, CURRICULUM_STATUS, STRUCTURE_LABELS, formatNumber } from './labels';

function components(subject: CurriculumSubject): string {
  if (subject.components.length === 0) return '—';
  return subject.components.map((c) => `${c.name} ${String(c.maxMarks)}`).join(' · ');
}

function totalCredits(subjects: CurriculumSubject[]): string {
  const values = subjects.map((s) => s.credits).filter((c): c is number => c !== null);
  if (values.length === 0) return '—';
  return String(Math.round(values.reduce((sum, c) => sum + c, 0) * 100) / 100);
}

function PeriodSubjects({
  curriculum,
  periodNumber,
  editable,
  onEdit,
  onRemove,
}: {
  curriculum: CurriculumDetail;
  periodNumber: number;
  editable: boolean;
  onEdit: (subject: CurriculumSubject) => void;
  onRemove: (subject: CurriculumSubject) => void;
}) {
  const period = curriculum.periods.find((p) => p.number === periodNumber);
  const subjects = period?.subjects ?? [];
  const reorder = useCurriculumMutation((ids: string[]) =>
    curriculaApi.reorder(curriculum.id, { periodNumber, assignmentIds: ids }),
  );
  function move(index: number, delta: -1 | 1) {
    const ids = subjects.map((s) => s.id);
    const target = index + delta;
    const [item] = ids.splice(index, 1);
    if (item === undefined || target < 0 || target > ids.length) return;
    ids.splice(target, 0, item);
    reorder.mutate(ids, {
      onError: (error) => {
        toast.error(errorMessage(error));
      },
    });
  }

  if (subjects.length === 0) {
    return (
      <EmptyState
        title={`No subjects in ${period?.label ?? 'this period'} yet`}
        description={
          editable
            ? 'Add subjects from the catalogue.'
            : 'This version has no subjects in this period.'
        }
      />
    );
  }

  const actions = (subject: CurriculumSubject, index: number) =>
    editable && (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={`Move ${subject.subject.code} up`}
          disabled={index === 0 || reorder.isPending}
          onClick={() => {
            move(index, -1);
          }}
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={`Move ${subject.subject.code} down`}
          disabled={index === subjects.length - 1 || reorder.isPending}
          onClick={() => {
            move(index, 1);
          }}
        >
          <ArrowDownIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={`Edit ${subject.subject.code}`}
          onClick={() => {
            onEdit(subject);
          }}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 text-danger-text hover:text-danger-text"
          aria-label={`Remove ${subject.subject.code}`}
          onClick={() => {
            onRemove(subject);
          }}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    );

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Subjects in {period?.label}</caption>
          <thead className="bg-muted/60 text-foreground/80">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                #
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Subject
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Type
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Credits
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Max
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Pass
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Components
              </th>
              {editable && (
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject, index) => (
              <tr key={subject.id} className="border-t border-border align-top">
                <td className="px-3 py-2 text-foreground/80 tabular">{index + 1}</td>
                <td className="px-3 py-2">
                  <span className="font-medium text-navy-950">{subject.subject.code}</span>
                  <span className="block break-words">{subject.subject.name}</span>
                  {subject.subject.status === 'INACTIVE' && (
                    <span className="text-xs text-warning-text">Inactive in catalogue</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {subject.classification ? CATEGORY_LABELS[subject.classification] : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular">{formatNumber(subject.credits)}</td>
                <td className="px-3 py-2 text-right tabular">{formatNumber(subject.maxMarks)}</td>
                <td className="px-3 py-2 text-right tabular">{formatNumber(subject.passMarks)}</td>
                <td className="px-3 py-2 text-xs text-foreground/80">{components(subject)}</td>
                {editable && <td className="px-3 py-1">{actions(subject, index)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul
        className="flex flex-col gap-3 md:hidden"
        aria-label={`Subjects in ${period?.label ?? ''}`}
      >
        {subjects.map((subject, index) => (
          <li key={subject.id} className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="font-medium text-navy-950">
              {index + 1}. {subject.subject.code}
            </p>
            <p className="break-words">{subject.subject.name}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <dt className="text-meta">Credits</dt>
                <dd className="tabular">{formatNumber(subject.credits)}</dd>
              </div>
              <div>
                <dt className="text-meta">Max</dt>
                <dd className="tabular">{formatNumber(subject.maxMarks)}</dd>
              </div>
              <div>
                <dt className="text-meta">Pass</dt>
                <dd className="tabular">{formatNumber(subject.passMarks)}</dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-foreground/80">
              {subject.classification ? CATEGORY_LABELS[subject.classification] : '—'} ·{' '}
              {components(subject)}
            </p>
            {editable && <div className="mt-2">{actions(subject, index)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function CurriculumEditorView({
  programId,
  curriculumId,
}: {
  programId: string;
  curriculumId: string;
}) {
  const query = useCurriculum(curriculumId);
  const program = useProgram(programId);
  const canWrite = useCan(PERMISSIONS.curriculaWrite);
  const canActivate = useCan(PERMISSIONS.curriculaActivate);
  const canArchive = useCan(PERMISSIONS.curriculaArchive);
  const canSeeStudents = useCan(PERMISSIONS.registrationsRead);
  const [tab, setTab] = useState('1');
  const [dialog, setDialog] = useState<
    | { kind: 'add'; period: number }
    | { kind: 'edit'; subject: CurriculumSubject }
    | { kind: 'details' | 'activate' | 'archive' | 'end-date' }
    | null
  >(null);
  const [removing, setRemoving] = useState<CurriculumSubject | null>(null);
  useSetBreadcrumbLabel(query.data ? `Version ${query.data.versionCode}` : null);

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const curriculum = query.data;
  if (curriculum.program.id !== programId) {
    return <ErrorState error={new Error('This curriculum belongs to another course.')} />;
  }
  const editable = curriculum.status === 'DRAFT' && canWrite;
  const status = CURRICULUM_STATUS[curriculum.status];
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Link
                href={`/admin/programs/${curriculum.program.id}`}
                className="rounded text-sm font-medium text-brand hover:underline"
              >
                {curriculum.program.code} — {curriculum.program.name}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-page-title break-words text-navy-950">
                  {curriculum.versionCode} · {curriculum.name}
                </h1>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <p className="text-meta mt-1">
                {STRUCTURE_LABELS[curriculum.structureType]} ·{' '}
                {periodUnit(curriculum.structureType, curriculum.numberOfPeriods)} ·{' '}
                {curriculum.subjectCount} subject(s) · {curriculum.registrationCount} student(s)
              </p>
              <p className="text-meta">
                Effective {curriculum.effectiveFrom ? formatDate(curriculum.effectiveFrom) : 'open'}{' '}
                – {curriculum.effectiveTo ? formatDate(curriculum.effectiveTo) : 'open'}
                {curriculum.activatedAt &&
                  ` · Activated ${formatDateTime(curriculum.activatedAt)}${curriculum.activatedBy ? ` by ${curriculum.activatedBy.displayName}` : ''}`}
                {curriculum.archivedAt && ` · Archived ${formatDateTime(curriculum.archivedAt)}`}
              </p>
              {curriculum.description && (
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  {curriculum.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {curriculum.status === 'DRAFT' && canWrite && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialog({ kind: 'details' });
                  }}
                >
                  <PencilIcon aria-hidden="true" />
                  Edit details
                </Button>
              )}
              {curriculum.status === 'ACTIVE' && canWrite && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialog({ kind: 'end-date' });
                  }}
                >
                  <CalendarIcon aria-hidden="true" />
                  Set end date
                </Button>
              )}
              {curriculum.status !== 'ARCHIVED' && canArchive && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialog({ kind: 'archive' });
                  }}
                >
                  <ArchiveIcon aria-hidden="true" />
                  Archive
                </Button>
              )}
              {curriculum.status === 'DRAFT' && canActivate && (
                <Button
                  disabled={curriculum.subjectCount === 0}
                  onClick={() => {
                    setDialog({ kind: 'activate' });
                  }}
                >
                  <CheckCircle2Icon aria-hidden="true" />
                  Activate curriculum
                </Button>
              )}
            </div>
          </div>
          {curriculum.status !== 'DRAFT' && (
            <div
              role="note"
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm text-navy-950"
            >
              <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>
                {curriculum.status === 'ACTIVE'
                  ? 'Read-only: this version is active. Create a new version from the course page to change subjects or marks.'
                  : 'Read-only: this version is archived and kept for historical records.'}
              </p>
            </div>
          )}
          {curriculum.status === 'DRAFT' && curriculum.subjectCount === 0 && (
            <p className="text-sm text-foreground/80">
              Add at least one subject before activating.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList aria-label="Semesters or years">
            {curriculum.periods.map((period) => (
              <TabsTrigger key={period.number} value={String(period.number)} className="px-3">
                {period.label}
                <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-foreground/80 tabular">
                  {period.subjects.length}
                </span>
              </TabsTrigger>
            ))}
            {canSeeStudents && (
              <TabsTrigger value="students" className="px-3">
                Students
              </TabsTrigger>
            )}
          </TabsList>
        </div>
        {curriculum.periods.map((period) => (
          <TabsContent
            key={period.number}
            value={String(period.number)}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-section-title text-navy-950">{period.label}</h2>
                <p className="text-meta">
                  {period.subjects.length} subject(s) · {totalCredits(period.subjects)} credits
                </p>
              </div>
              {editable && (
                <Button
                  onClick={() => {
                    setDialog({ kind: 'add', period: period.number });
                  }}
                >
                  <PlusIcon aria-hidden="true" />
                  Add subject
                </Button>
              )}
            </div>
            <PeriodSubjects
              curriculum={curriculum}
              periodNumber={period.number}
              editable={editable}
              onEdit={(subject) => {
                setDialog({ kind: 'edit', subject });
              }}
              onRemove={setRemoving}
            />
          </TabsContent>
        ))}
        {canSeeStudents && (
          <TabsContent value="students">
            <h2 className="text-section-title mb-2 text-navy-950">Students</h2>
            <CurriculumStudents curriculum={curriculum} />
          </TabsContent>
        )}
      </Tabs>

      <AssignmentDialog
        open={dialog?.kind === 'add' || dialog?.kind === 'edit'}
        onOpenChange={close}
        curriculum={curriculum}
        periodNumber={dialog?.kind === 'add' ? dialog.period : Number(tab) || 1}
        assignment={dialog?.kind === 'edit' ? dialog.subject : undefined}
      />
      {program.data && (
        <CurriculumDialog
          open={dialog?.kind === 'details'}
          onOpenChange={close}
          program={program.data}
          curriculum={curriculum}
        />
      )}
      <ActivateDialog
        curriculum={curriculum}
        open={dialog?.kind === 'activate'}
        onOpenChange={close}
      />
      <ArchiveDialog
        curriculum={curriculum}
        open={dialog?.kind === 'archive'}
        onOpenChange={close}
      />
      <EndDateDialog
        curriculum={curriculum}
        open={dialog?.kind === 'end-date'}
        onOpenChange={close}
      />
      <RemoveAssignmentDialog
        curriculum={curriculum}
        assignment={removing ? { id: removing.id, code: removing.subject.code } : null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      />
    </div>
  );
}
