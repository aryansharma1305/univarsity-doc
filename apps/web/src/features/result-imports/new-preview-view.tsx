'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Label } from '@docversity/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@docversity/ui/components/select';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { FileDropzone } from '@/features/imports/file-dropzone';
import { errorMessage } from '@/lib/api';
import { resultImportsApi } from './api';
import { PreviewNotice, PreviewSteps } from './shared';

function ContextSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={!options.length}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function NewResultPreviewView() {
  const canRun = useCan(PERMISSIONS.importsResultsRun);
  const router = useRouter();
  const query = useQuery({
    queryKey: ['result-imports', 'context'],
    queryFn: resultImportsApi.contexts,
    enabled: canRun,
  });
  const [programId, setProgram] = useState('');
  const [curriculumId, setCurriculum] = useState('');
  const [period, setPeriod] = useState('');
  const [sessionId, setSession] = useState('');
  const [examinationId, setExam] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const create = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Choose a workbook.');
      return resultImportsApi.create(
        {
          programId,
          curriculumId,
          periodNumber: Number(period),
          academicSessionId: sessionId,
          examinationId,
        },
        file,
      );
    },
    onSuccess: (preview) => {
      router.push(`/admin/results/import/${preview.id}`);
    },
  });
  const download = useMutation({
    mutationFn: resultImportsApi.template,
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!canRun) return <ForbiddenState />;
  const programs = query.data?.programs ?? [];
  const program = programs.find((p) => p.id === programId);
  const curriculum = program?.curricula.find((c) => c.id === curriculumId);
  const exams = curriculum?.examinations.filter((e) => e.period.number === Number(period)) ?? [];
  const sessions = [
    ...new Map(exams.map((e) => [e.academicSession.id, e.academicSession])).values(),
  ];
  const exam = exams.find((e) => e.id === examinationId);
  return (
    <>
      <PageHeader
        title="Import results"
        description="Check an Excel workbook against an existing examination and curriculum."
      />
      <PreviewNotice />
      <PreviewSteps current={examinationId ? 1 : 0} />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !programs.length ? (
        <EmptyState
          title="No examination context available"
          description="Create the course, curriculum and examination before uploading results."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="context-heading" className="rounded-lg border bg-card p-5">
            <h2 id="context-heading" className="mb-4 text-section-title">
              1. Select examination context
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ContextSelect
                label="Course"
                value={programId}
                options={programs.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                onChange={(value) => {
                  setProgram(value);
                  setCurriculum('');
                  setPeriod('');
                  setSession('');
                  setExam('');
                }}
              />
              <ContextSelect
                label="Curriculum version"
                value={curriculumId}
                options={(program?.curricula ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.versionCode} · ${c.name}`,
                  disabled: c.status === 'DRAFT',
                }))}
                onChange={(value) => {
                  setCurriculum(value);
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
                  label: `${p.label} · ${p.subjectCount} subjects`,
                  disabled: !p.subjectCount,
                }))}
                onChange={(value) => {
                  setPeriod(value);
                  setSession('');
                  setExam('');
                }}
              />
              <ContextSelect
                label="Academic session"
                value={sessionId}
                options={sessions.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
                onChange={(value) => {
                  setSession(value);
                  setExam('');
                }}
              />
              <ContextSelect
                label="Examination"
                value={examinationId}
                options={exams
                  .filter((e) => e.academicSession.id === sessionId)
                  .map((e) => ({
                    value: e.id,
                    label: `${e.code} · ${e.name} (${e.status})`,
                    disabled: !!e.blocker,
                  }))}
                onChange={setExam}
              />
            </div>
            <p className="mt-4 text-meta">
              Draft, published and archived examinations cannot be previewed. The server checks
              every selected association again.
            </p>
          </section>
          <section
            aria-labelledby="upload-heading"
            className="flex flex-col gap-4 rounded-lg border bg-card p-5"
          >
            <h2 id="upload-heading" className="text-section-title">
              2. Upload workbook
            </h2>
            <p className="text-sm text-muted-foreground">
              Keep registration numbers as text to preserve leading zeros. Grades are not accepted
              in this phase.
            </p>
            <div>
              <Button
                variant="outline"
                disabled={download.isPending}
                onClick={() => {
                  download.mutate();
                }}
              >
                Download results template
              </Button>
            </div>
            <FileDropzone file={file} onFile={setFile} disabled={create.isPending} />
            {create.isError && (
              <p role="alert" className="text-danger-text">
                {errorMessage(create.error)}
              </p>
            )}
            <div>
              <Button
                disabled={!file || !exam || !!exam.blocker || create.isPending}
                onClick={() => {
                  create.mutate();
                }}
              >
                {create.isPending ? 'Uploading…' : 'Upload and map columns'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
