'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { MonitorSmartphoneIcon, PlusIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@docversity/ui/components/select';
import {
  type CreateExaminationInput,
  createExaminationSchema,
  EXAMINATION_KIND_LABELS,
  type ExaminationKind,
  type ExaminationRow,
  type ExaminationStatus,
  periodLabel,
} from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useCan } from '@/components/providers/session-context';
import { useListParams } from '@/hooks/use-list-params';
import { useSessionOptions } from '@/features/academic-sessions/api';
import { curriculaApi } from '@/features/curricula/api';
import { useProgramOptions } from '@/features/programs/api';
import { examinationsApi, useExaminationMutation, useExaminations } from './api';
import { EXAM_STATUS, KIND_OPTIONS, STATUS_FILTER_OPTIONS } from './labels';

export function ExamStatusBadge({ status }: { status: ExaminationStatus }) {
  return <StatusBadge tone={EXAM_STATUS[status].tone}>{EXAM_STATUS[status].label}</StatusBadge>;
}

function CreateExaminationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const programs = useProgramOptions();
  const sessions = useSessionOptions();
  const [programId, setProgramId] = useState('');
  const curricula = useQuery({
    queryKey: ['curricula', 'program', programId],
    queryFn: () => curriculaApi.list(programId),
    enabled: programId !== '',
  });
  const usable = (curricula.data?.data ?? []).filter((c) => c.status !== 'DRAFT');
  const form = useForm<CreateExaminationInput>({
    resolver: zodResolver(createExaminationSchema),
    defaultValues: {
      code: '',
      name: '',
      curriculumId: '',
      academicSessionId: '',
      periodNumber: '' as unknown as number,
      kind: 'REGULAR',
      examSession: '',
      examType: '',
    },
  });
  const curriculumId = useWatch({ control: form.control, name: 'curriculumId' });
  const chosen = usable.find((c) => c.id === curriculumId);
  const periodOptions = chosen
    ? Array.from({ length: chosen.numberOfPeriods }, (_, index) => ({
        value: String(index + 1),
        label: periodLabel(chosen.structureType, index + 1),
      }))
    : [];
  const create = useExaminationMutation(examinationsApi.create);
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await create.mutateAsync(createExaminationSchema.parse(values));
      toast.success('Examination record created as a draft.');
      onOpenChange(false);
      router.push(`/admin/examinations/${saved.id}`);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New examination record</DialogTitle>
          <DialogDescription>
            Records which curriculum, semester or year and session an examination belongs to. The
            examination itself is held in the university’s examination application; no schedule or
            eligibility is created here.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="exam-program">
              Course <span aria-hidden="true">*</span>
            </Label>
            <Select
              value={programId}
              onValueChange={(value) => {
                setProgramId(value);
                form.setValue('curriculumId', '');
              }}
            >
              <SelectTrigger id="exam-program" aria-label="Course" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {programs.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SelectField
            control={form.control}
            name="curriculumId"
            label="Curriculum version"
            hint={
              programId && !curricula.isPending && usable.length === 0
                ? 'This course has no active or archived curriculum version.'
                : 'Active or archived versions only.'
            }
            options={usable.map((c) => ({
              value: c.id,
              label: `${c.versionCode} — ${c.name} (${c.status.toLowerCase()})`,
            }))}
            disabled={programId === ''}
            required
          />
          <SelectField
            control={form.control}
            name="periodNumber"
            label="Semester / year"
            options={periodOptions}
            disabled={!chosen}
            required
          />
          <SelectField
            control={form.control}
            name="kind"
            label="Kind"
            options={KIND_OPTIONS}
            required
          />
          <SelectField
            control={form.control}
            name="academicSessionId"
            label="Academic session"
            options={sessions.options}
            required
          />
          <Field control={form.control} name="code" label="Code" required>
            {(aria) => <Input {...aria} autoComplete="off" {...form.register('code')} />}
          </Field>
          <Field control={form.control} name="name" label="Name" required>
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <Field
            control={form.control}
            name="examSession"
            label="Examination session"
            hint='As the university labels it, e.g. "May–June 2026".'
            required
          >
            {(aria) => <Input {...aria} {...form.register('examSession')} />}
          </Field>
          <Field control={form.control} name="examType" label="Type label">
            {(aria) => <Input {...aria} {...form.register('examType')} />}
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Working…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExaminationsView() {
  const canManage = useCan(PERMISSIONS.examinationsManage);
  const [creating, setCreating] = useState(false);
  const { values, page, update } = useListParams(['kind', 'status'] as const);
  const query = useExaminations({
    page,
    search: values.search || undefined,
    kind: (values.kind || undefined) as ExaminationKind | undefined,
    status: (values.status || undefined) as ExaminationStatus | undefined,
    sortOrder: 'desc',
  });
  const columns: ColumnDef<ExaminationRow>[] = [
    {
      header: 'Examination',
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/admin/examinations/${row.original.id}`}
            className="font-medium break-words text-brand hover:underline"
          >
            {row.original.name}
          </Link>
          <p className="text-meta tabular">{row.original.code}</p>
        </div>
      ),
    },
    {
      header: 'Course · curriculum',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="break-words">{row.original.program.code}</p>
          <p className="text-meta">{row.original.curriculum?.versionCode ?? 'No curriculum'}</p>
        </div>
      ),
    },
    { header: 'Period', cell: ({ row }) => row.original.period.label },
    { header: 'Session', cell: ({ row }) => row.original.examSession },
    { header: 'Kind', cell: ({ row }) => EXAMINATION_KIND_LABELS[row.original.kind] },
    {
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <ExamStatusBadge status={row.original.status} />
          {row.original.reExamApplicationsOpen && (
            <span className="text-meta">Accepting re-exam applications</span>
          )}
        </div>
      ),
    },
  ];
  const filtered = Boolean(values.search || values.kind || values.status);
  return (
    <>
      <PageHeader
        title="Examinations"
        description="Examination records by curriculum, semester or year. Examinations are held in the university’s separate examination application."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/examinations/application">
                <MonitorSmartphoneIcon aria-hidden="true" />
                Examination application
              </Link>
            </Button>
            {canManage && (
              <Button
                onClick={() => {
                  setCreating(true);
                }}
              >
                <PlusIcon aria-hidden="true" />
                New examination
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <SearchInput
          label="Search examinations"
          value={values.search}
          onChange={(search) => {
            update({ search, page: 1 });
          }}
        />
        <FilterSelect
          label="Kind"
          value={values.kind}
          onChange={(kind) => {
            update({ kind, page: 1 });
          }}
          options={KIND_OPTIONS}
          allLabel="All kinds"
        />
        <FilterSelect
          label="Status"
          value={values.status}
          onChange={(status) => {
            update({ status, page: 1 });
          }}
          options={STATUS_FILTER_OPTIONS}
          allLabel="All statuses"
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No examinations match these filters' : 'No examination records yet'}
          description={
            filtered
              ? undefined
              : 'Create a record for a curriculum version and semester or year when the university announces an examination.'
          }
        />
      ) : (
        <>
          <DataTable
            caption="Examination records"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(exam) => (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/admin/examinations/${exam.id}`}
                  className="font-medium break-words text-brand hover:underline"
                >
                  {exam.name}
                </Link>
                <p className="text-sm break-words">
                  {exam.program.code} · {exam.curriculum?.versionCode ?? 'No curriculum'} ·{' '}
                  {exam.period.label}
                </p>
                <p className="text-meta">
                  {EXAMINATION_KIND_LABELS[exam.kind]} · {exam.examSession}
                </p>
                <ExamStatusBadge status={exam.status} />
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
      {canManage && <CreateExaminationDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}
