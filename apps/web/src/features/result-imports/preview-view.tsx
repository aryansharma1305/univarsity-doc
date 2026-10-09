'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import {
  RESULT_IMPORT_FIELDS,
  type ResultPreview,
  type ResultColumnMapping,
  type ResultPreviewRow,
  type ResultPreviewRowQuery,
} from '@docversity/validation';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Label } from '@docversity/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@docversity/ui/components/select';
import { Input } from '@docversity/ui/components/input';
import { PageHeader } from '@/components/data/page-header';
import { DataTable } from '@/components/data/data-table';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { ApiError, errorMessage } from '@/lib/api';
import { resultImportsApi } from './api';
import { PreviewNotice, PreviewSteps } from './shared';

function Marks({ row }: { row: ResultPreviewRow }) {
  return (
    <dl className="grid min-w-36 grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-sm">
      {RESULT_IMPORT_FIELDS.filter(
        (f) => f.key !== 'grade' && f.kind === 'numeric' && row.marks[f.key] != null,
      ).map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd>{row.marks[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}
function Issues({ row }: { row: ResultPreviewRow }) {
  return (
    <ul className="flex max-w-md md:min-w-64 flex-col gap-2 whitespace-normal break-words text-sm">
      {row.issues.map((issue, index) => (
        <li
          key={`${issue.code}-${index}`}
          className={issue.severity === 'error' ? 'text-danger-text' : 'text-warning-text'}
        >
          <span className="font-medium">
            {issue.field
              ? `${RESULT_IMPORT_FIELDS.find((f) => f.key === issue.field)?.label ?? issue.field}: `
              : ''}
          </span>
          {issue.message}
          <span className="block text-xs">{issue.code}</span>
        </li>
      ))}
    </ul>
  );
}
function RowStatus({ row }: { row: ResultPreviewRow }) {
  return (
    <span className="shrink-0 self-start">
      <StatusBadge
        tone={row.status === 'ERROR' ? 'danger' : row.status === 'WARNING' ? 'warning' : 'success'}
      >
        {row.status === 'VALID' ? 'Valid' : row.status === 'WARNING' ? 'Warning' : 'Error'}
      </StatusBadge>
    </span>
  );
}
function PreviewRows({ preview }: { preview: ResultPreview }) {
  const [filter, setFilter] = useState<ResultPreviewRowQuery['filter']>('all');
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['result-imports', preview.id, 'rows', { filter, search, code, page }],
    queryFn: () =>
      resultImportsApi.rows(preview.id, {
        filter,
        search,
        code: code || undefined,
        page,
        pageSize: 25,
      }),
  });
  const columns: ColumnDef<ResultPreviewRow>[] = [
    { header: 'Excel row', accessorKey: 'rowNumber' },
    { header: 'Registration number', accessorKey: 'registrationNumber' },
    {
      header: 'Subject',
      cell: ({ row }) => (
        <span>
          {row.original.subjectCode ?? '—'}
          <span className="block text-meta">{row.original.subjectName}</span>
        </span>
      ),
    },
    { header: 'Marks', cell: ({ row }) => <Marks row={row.original} /> },
    { header: 'Status', cell: ({ row }) => <RowStatus row={row.original} /> },
    { header: 'Issues', cell: ({ row }) => <Issues row={row.original} /> },
  ];
  const counts = preview.counts;
  return (
    <section aria-labelledby="rows-heading" className="flex flex-col gap-4">
      <h2 id="rows-heading" className="text-section-title">
        5. Preview rows
      </h2>
      <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2">
        {(['all', 'valid', 'warnings', 'errors'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {value === 'all'
              ? 'All'
              : value === 'valid'
                ? 'Valid'
                : value === 'warnings'
                  ? 'Warnings'
                  : 'Errors'}{' '}
            ({counts?.[value === 'all' ? 'total' : value] ?? 0})
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          label="Search registration, subject or Excel row"
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="issue-code">Issue code</Label>
          <Input
            id="issue-code"
            value={code}
            placeholder="e.g. DUPLICATE_ROW"
            onChange={(event) => {
              setCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z_]/g, '')
                  .slice(0, 64),
              );
              setPage(1);
            }}
          />
        </div>
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.data.length ? (
        <EmptyState title="No matching rows" description="Change the search or row filter." />
      ) : (
        <>
          <DataTable
            caption="Results preview rows"
            data={query.data.data}
            columns={columns}
            getRowId={(row) => String(row.rowNumber)}
            renderCard={(row) => (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0 break-words">
                    <p className="font-medium">{row.registrationNumber ?? '—'}</p>
                    <p>
                      {row.subjectCode ?? '—'} · {row.subjectName ?? 'Unresolved subject'}
                    </p>
                    <p className="text-meta">Excel row {row.rowNumber}</p>
                  </div>
                  <RowStatus row={row} />
                </div>
                <Marks row={row} />
                <Issues row={row} />
              </div>
            )}
          />
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}
function Mapping({ preview }: { preview: ResultPreview }) {
  const client = useQueryClient();
  const initialSheet =
    preview.sheets.find((s) => s.name === preview.mapping?.worksheet) ??
    preview.sheets.find((s) => !s.problem);
  const [worksheet, setWorksheet] = useState(initialSheet?.name ?? '');
  const [columns, setColumns] = useState<ResultColumnMapping>(
    preview.mapping?.columns ?? initialSheet?.suggestedMapping ?? {},
  );
  const sheet = preview.sheets.find((s) => s.name === worksheet);
  const validate = useMutation({
    mutationFn: () => resultImportsApi.validate(preview.id, { worksheet, columns }),
    onSuccess: async (value) => {
      client.setQueryData(['result-imports', preview.id], value);
      await client.invalidateQueries({ queryKey: ['result-imports', preview.id, 'rows'] });
    },
  });
  return (
    <section
      aria-labelledby="mapping-heading"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <h2 id="mapping-heading" className="text-section-title">
        3. Map columns
      </h2>
      <p className="text-sm text-muted-foreground">
        Check the suggested mapping. Each column can be used once. Grades are ignored;
        identity-number columns cannot be mapped.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="worksheet">Worksheet</Label>
        <Select
          value={worksheet}
          disabled={validate.isPending}
          onValueChange={(value) => {
            setWorksheet(value);
            setColumns(preview.sheets.find((s) => s.name === value)?.suggestedMapping ?? {});
          }}
        >
          <SelectTrigger id="worksheet">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {preview.sheets.map((s) => (
              <SelectItem key={s.name} value={s.name} disabled={!!s.problem}>
                {s.name} ({s.rowCount} rows){s.problem ? ` — ${s.problem}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {RESULT_IMPORT_FIELDS.filter((f) => f.key !== 'grade').map((field) => {
          const required =
            field.required || preview.components.some((c) => c.field === field.key && c.required);
          return (
            <div key={field.key} className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={field.key}>
                {field.label}
                {required ? ' (required)' : ''}
              </Label>
              <Select
                value={String(columns[field.key] ?? 'none')}
                disabled={validate.isPending}
                onValueChange={(value) => {
                  setColumns((current) => ({
                    ...current,
                    [field.key]: value === 'none' ? null : Number(value),
                  }));
                }}
              >
                <SelectTrigger id={field.key}>
                  <SelectValue placeholder="Choose column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not mapped</SelectItem>
                  {sheet?.columns
                    .filter((c) => !c.sensitive)
                    .map((c) => (
                      <SelectItem key={c.index} value={String(c.index)}>
                        {c.letter} · {c.header || 'No header'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      {validate.isError && (
        <div role="alert" className="text-sm text-danger-text">
          <p>{errorMessage(validate.error)}</p>
          {validate.error instanceof ApiError && (
            <ul>
              {validate.error.details.map((d) => (
                <li key={d.path}>
                  {d.path}: {d.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <Button
          onClick={() => {
            validate.mutate();
          }}
          disabled={!sheet || !!sheet.problem || validate.isPending}
        >
          {validate.isPending
            ? 'Validating rows…'
            : preview.counts
              ? 'Revalidate mapping'
              : '4. Validate and preview'}
        </Button>
      </div>
    </section>
  );
}
export function ResultPreviewView({ id }: { id: string }) {
  const canRun = useCan(PERMISSIONS.importsResultsRun);
  const router = useRouter();
  const query = useQuery({
    queryKey: ['result-imports', id],
    queryFn: () => resultImportsApi.get(id),
    enabled: canRun,
    retry: false,
  });
  const report = useMutation({
    mutationFn: () => resultImportsApi.report(id),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const discard = useMutation({
    mutationFn: () => resultImportsApi.discard(id),
    onSuccess: () => {
      router.push('/admin/results/import');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!canRun) return <ForbiddenState />;
  const preview = query.data;
  return (
    <>
      <PageHeader
        title="Results preview"
        description="Check normalized marks and validation messages for this workbook."
      />
      <PreviewNotice />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.isNotFound ? (
          <EmptyState
            title="Preview unavailable"
            description="This preview may have expired or been discarded. Previews are private to their creator."
            action={
              <Button asChild>
                <Link href="/admin/results/import">Upload again</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )
      ) : preview ? (
        <div className="flex flex-col gap-6">
          <PreviewSteps current={preview.counts ? 4 : 2} />
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-section-title">
              {preview.context.examination.code} · {preview.context.examination.name}
            </h2>
            <p className="mt-2 text-sm">
              {preview.context.program.name} · {preview.context.curriculum.versionCode} ·{' '}
              {preview.context.period.label} · {preview.context.academicSession.name}
            </p>
            <p className="mt-2 break-all text-meta">
              {preview.originalFilename} · {preview.context.subjectCount}{' '}
              {preview.context.subjectCount === 1 ? 'subject' : 'subjects'} · Expires{' '}
              {new Date(preview.expiresAt).toLocaleString()}
            </p>
            {preview.unrecognizedComponents.length > 0 && (
              <p role="note" className="mt-3 text-warning-text">
                Configuration required: {preview.unrecognizedComponents.join(', ')}. These
                components cannot be checked against marks columns.
              </p>
            )}
          </section>
          <Mapping key={preview.id} preview={preview} />
          {preview.counts && (
            <>
              <p role="status" className="text-sm">
                {preview.counts.total} rows: {preview.counts.valid} valid, {preview.counts.warnings}{' '}
                with warnings, {preview.counts.errors} with errors.
              </p>
              <PreviewRows preview={preview} />
              <section className="flex flex-col gap-3">
                <h2 className="text-section-title">6. Download error report</h2>
                <p className="text-sm text-muted-foreground">
                  The report includes errors and warnings with their original Excel row numbers.
                </p>
                <div>
                  <Button
                    variant="outline"
                    disabled={!preview.hasErrorReport || report.isPending}
                    onClick={() => {
                      report.mutate();
                    }}
                  >
                    Download error report
                  </Button>
                </div>
                {!preview.hasErrorReport && (
                  <p className="text-meta">No report is needed: there are no row issues.</p>
                )}
              </section>
            </>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={discard.isPending}
              onClick={() => {
                discard.mutate();
              }}
            >
              {discard.isPending ? 'Discarding…' : 'Discard preview and start again'}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
