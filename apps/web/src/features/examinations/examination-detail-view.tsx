'use client';

import { ArchiveIcon, DoorClosedIcon, DoorOpenIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { EXAMINATION_KIND_LABELS, type ExaminationDetail } from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { ErrorState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { examinationsApi, useExamination, useExaminationMutation } from './api';
import { ExamStatusBadge } from './examinations-view';

type Action = 'open' | 'archive' | 'accept' | 'close' | null;

const ACTIONS: Record<
  Exclude<Action, null>,
  { title: string; description: string; confirm: string; done: string }
> = {
  open: {
    title: 'Open this examination record?',
    description:
      'Students whose registration follows this curriculum version will see it on their Examinations page. Opening does not schedule the examination or register anyone for it.',
    confirm: 'Open record',
    done: 'Examination record opened.',
  },
  archive: {
    title: 'Archive this examination record?',
    description:
      'It is hidden from students and stops accepting re-exam applications. The record and its history are kept.',
    confirm: 'Archive',
    done: 'Examination record archived.',
  },
  accept: {
    title: 'Accept re-exam applications?',
    description:
      'Students of this curriculum version can apply for a re-examination in its subjects until you close applications.',
    confirm: 'Accept applications',
    done: 'Re-exam applications are open.',
  },
  close: {
    title: 'Close re-exam applications?',
    description: 'Students can no longer submit new applications. Existing applications are kept.',
    confirm: 'Close applications',
    done: 'Re-exam applications are closed.',
  },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd className="text-sm break-words text-navy-950">{value}</dd>
    </div>
  );
}

export function ExaminationDetailView({ examinationId }: { examinationId: string }) {
  const query = useExamination(examinationId);
  const canManage = useCan(PERMISSIONS.examinationsManage);
  const [action, setAction] = useState<Action>(null);
  const run = useExaminationMutation((which: Exclude<Action, null>) => {
    if (which === 'open') return examinationsApi.open(examinationId);
    if (which === 'archive') return examinationsApi.archive(examinationId);
    return examinationsApi.setReExamApplications(examinationId, which === 'accept');
  });
  useSetBreadcrumbLabel(query.data ? query.data.name : null);

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const exam: ExaminationDetail = query.data;
  const isReExam = exam.kind === 'RE_EXAMINATION';
  const current = action ? ACTIONS[action] : null;

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-meta">
              {EXAMINATION_KIND_LABELS[exam.kind]} · <span className="tabular">{exam.code}</span>
            </p>
            <h1 className="text-page-title break-words text-navy-950">{exam.name}</h1>
            <p className="mt-1 text-sm break-words">
              {exam.program.code} — {exam.program.name} · {exam.period.label}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ExamStatusBadge status={exam.status} />
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {exam.status === 'DRAFT' && (
                <Button
                  onClick={() => {
                    setAction('open');
                  }}
                >
                  <SendIcon aria-hidden="true" />
                  Open record
                </Button>
              )}
              {isReExam && exam.status === 'OPEN' && !exam.reExamApplicationsOpen && (
                <Button
                  onClick={() => {
                    setAction('accept');
                  }}
                >
                  <DoorOpenIcon aria-hidden="true" />
                  Accept re-exam applications
                </Button>
              )}
              {exam.reExamApplicationsOpen && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAction('close');
                  }}
                >
                  <DoorClosedIcon aria-hidden="true" />
                  Close applications
                </Button>
              )}
              {(exam.status === 'DRAFT' || exam.status === 'OPEN') && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAction('archive');
                  }}
                >
                  <ArchiveIcon aria-hidden="true" />
                  Archive
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5">
          <h2 className="text-section-title text-navy-950">Record</h2>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Row
              label="Curriculum version"
              value={
                exam.curriculum
                  ? `${exam.curriculum.versionCode} — ${exam.curriculum.name}`
                  : 'Not linked (created before Phase 9)'
              }
            />
            <Row label="Semester / year" value={exam.period.label} />
            <Row
              label="Academic session"
              value={`${exam.academicSession.code} — ${exam.academicSession.name}`}
            />
            <Row label="Examination session" value={exam.examSession} />
            <Row label="Type label" value={exam.examType ?? '—'} />
            <Row
              label="Re-exam applications"
              value={
                isReExam
                  ? exam.reExamApplicationsOpen
                    ? 'Accepting applications'
                    : 'Not accepting applications'
                  : 'Not applicable (regular examination)'
              }
            />
          </dl>
          <p className="text-xs text-foreground/80">
            The examination is conducted in the university’s examination application. Docversity
            keeps the record only; it does not schedule examinations or decide eligibility.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5">
          <h2 className="text-section-title text-navy-950">History</h2>
          <ol className="divide-y divide-border rounded-lg border border-border">
            {exam.history.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4"
              >
                <span className="text-sm text-navy-950">{item.summary}</span>
                <span className="text-meta shrink-0">
                  {item.actor ?? 'System'} · {formatDateTime(item.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Dialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null);
            run.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {current && action && (
            <>
              <DialogHeader>
                <DialogTitle>{current.title}</DialogTitle>
                <DialogDescription>{current.description}</DialogDescription>
              </DialogHeader>
              {run.error && (
                <p role="alert" className="text-sm text-danger-text">
                  {errorMessage(run.error)}
                </p>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAction(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={run.isPending}
                  onClick={() => {
                    run.mutate(action, {
                      onSuccess: () => {
                        toast.success(current.done);
                        setAction(null);
                      },
                    });
                  }}
                >
                  {run.isPending ? 'Working…' : current.confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
