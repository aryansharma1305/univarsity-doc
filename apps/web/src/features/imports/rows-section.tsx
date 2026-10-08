'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@docversity/ui/components/sheet';
import { Skeleton } from '@docversity/ui/components/skeleton';
import {
  type ImportIssue,
  type ImportRowFilter,
  type ImportRowSummary,
  STUDENT_IMPORT_FIELDS,
  studentImportField,
} from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { Pagination } from '@/components/data/pagination';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useImportRow, useImportRows } from './api';
import { formatCount, ROW_ACTION, ROW_STATUS } from './labels';

export interface RowFilterOption {
  value: ImportRowFilter;
  label: string;
  count: number;
}

function IssueText({ issue }: { issue: ImportIssue }) {
  const label = issue.field ? studentImportField(issue.field).label : null;
  return (
    <span className={issue.severity === 'error' ? 'text-danger-text' : 'text-warning-text'}>
      <span className="font-medium">{issue.severity === 'error' ? 'Error' : 'Warning'}:</span>{' '}
      {label && !issue.message.startsWith(label) ? `${label} — ` : ''}
      {issue.message}
    </span>
  );
}

function IssuesCell({ issues }: { issues: ImportIssue[] }) {
  const [first] = issues;
  if (!first) return <span className="text-meta">—</span>;
  return (
    <span className="text-sm">
      <IssueText issue={first} />
      {issues.length > 1 && <span className="text-meta"> (+{issues.length - 1} more)</span>}
    </span>
  );
}

function RowBadges({ row }: { row: Pick<ImportRowSummary, 'status' | 'action'> }) {
  return (
    <span className="flex flex-wrap gap-1">
      <StatusBadge tone={ROW_STATUS[row.status].tone}>{ROW_STATUS[row.status].label}</StatusBadge>
      {row.action && <StatusBadge tone="neutral">{ROW_ACTION[row.action].label}</StatusBadge>}
    </span>
  );
}

function ValueList({
  values,
  title,
}: {
  values: Partial<Record<string, string | null>>;
  title: string;
}) {
  const entries = STUDENT_IMPORT_FIELDS.filter((field) => field.key in values);
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-navy-950">{title}</h3>
      <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-sm">
        {entries.map((field) => (
          <div key={field.key} className="contents">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="break-words text-navy-950">{values[field.key] ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Everything about one row: source cells, normalised values, issues, current vs proposed data. */
function RowDetailSheet({
  importId,
  rowNumber,
  onClose,
}: {
  importId: string;
  rowNumber: number | null;
  onClose: () => void;
}) {
  const query = useImportRow(importId, rowNumber);
  const row = query.data;
  return (
    <Sheet
      open={rowNumber !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Row {rowNumber}</SheetTitle>
          <SheetDescription>
            Spreadsheet row {rowNumber} as read, validated and classified.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          {query.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : row ? (
            <>
              <div className="flex flex-col gap-2">
                <RowBadges row={row} />
                {row.action && <p className="text-meta">{ROW_ACTION[row.action].description}</p>}
              </div>
              {row.issues.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-navy-950">Issues</h3>
                  <ul className="flex flex-col gap-2 text-sm">
                    {row.issues.map((issue, index) => (
                      <li
                        key={`${issue.code}-${index}`}
                        className={`rounded-md px-3 py-2 ${issue.severity === 'error' ? 'bg-danger-soft' : 'bg-warning-soft'}`}
                      >
                        <IssueText issue={issue} />
                        <span className="mt-1 block font-mono text-xs text-muted-foreground">
                          {issue.code}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {row.changes.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-navy-950">
                    Proposed changes to the existing record
                  </h3>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 text-left text-xs text-muted-foreground uppercase">
                        <tr>
                          <th scope="col" className="px-3 py-2">
                            Field
                          </th>
                          <th scope="col" className="px-3 py-2">
                            Current
                          </th>
                          <th scope="col" className="px-3 py-2">
                            Incoming
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.changes.map((change) => (
                          <tr key={change.field} className="border-t border-border">
                            <th scope="row" className="px-3 py-2 text-left font-medium">
                              {studentImportField(change.field).label}
                            </th>
                            <td className="px-3 py-2 break-words">{change.from ?? '—'}</td>
                            <td className="px-3 py-2 break-words">{change.to ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <ValueList title="Values to import (normalised)" values={row.normalized} />
              {row.current && <ValueList title="Current database record" values={row.current} />}
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-navy-950">Source row</h3>
                <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-sm">
                  {row.source.map((cell) => (
                    <div key={cell.letter} className="contents">
                      <dt className="text-muted-foreground">
                        {cell.letter} · {cell.header || '(no header)'}
                      </dt>
                      <dd className="break-words text-navy-950">{cell.value ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              {row.studentId && (
                <Button asChild variant="outline">
                  <Link href={`/admin/students/${row.studentId}`}>Open student record</Link>
                </Button>
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Paginated, filterable rows of an import, with a detail drawer. */
export function RowsSection({
  importId,
  filters,
}: {
  importId: string;
  filters: RowFilterOption[];
}) {
  const [filter, setFilter] = useState<ImportRowFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const query = useImportRows(importId, { filter, page, pageSize: 25 }, true);

  const columns: ColumnDef<ImportRowSummary>[] = [
    { header: 'Row', cell: ({ row }) => <span className="tabular">{row.original.rowNumber}</span> },
    {
      header: 'Registration number',
      cell: ({ row }) => (
        <span className="font-medium break-all text-navy-950">
          {row.original.registrationNumber ?? '—'}
        </span>
      ),
    },
    { header: 'Student name', cell: ({ row }) => row.original.fullName ?? '—' },
    {
      header: 'Action',
      cell: ({ row }) => (row.original.action ? ROW_ACTION[row.original.action].label : '—'),
    },
    {
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge tone={ROW_STATUS[row.original.status].tone}>
          {ROW_STATUS[row.original.status].label}
        </StatusBadge>
      ),
    },
    { header: 'Issues', cell: ({ row }) => <IssuesCell issues={row.original.issues} /> },
    {
      id: 'details',
      header: () => <span className="sr-only">Details</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Details of row ${row.original.rowNumber}`}
          onClick={() => {
            setSelected(row.original.rowNumber);
          }}
        >
          Details
        </Button>
      ),
    },
  ];

  return (
    <section aria-labelledby="rows-heading" className="flex flex-col gap-4">
      <h2 id="rows-heading" className="text-section-title text-navy-950">
        Rows
      </h2>
      <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2">
        {filters.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? 'default' : 'outline'}
            aria-pressed={filter === option.value}
            onClick={() => {
              setFilter(option.value);
              setPage(1);
            }}
          >
            {option.label} <span className="tabular">({formatCount(option.count)})</span>
          </Button>
        ))}
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState title="No rows in this view" description="Choose another filter." />
      ) : (
        <>
          <DataTable
            caption="Import rows"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => String(row.rowNumber)}
            renderCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-all text-navy-950">
                      {row.registrationNumber ?? '—'}
                    </p>
                    <p className="text-sm">{row.fullName ?? '—'}</p>
                    <p className="text-meta">Row {row.rowNumber}</p>
                  </div>
                  <RowBadges row={row} />
                </div>
                <IssuesCell issues={row.issues} />
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Details of row ${row.rowNumber}`}
                    onClick={() => {
                      setSelected(row.rowNumber);
                    }}
                  >
                    Details
                  </Button>
                </div>
              </div>
            )}
          />
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <RowDetailSheet
        importId={importId}
        rowNumber={selected}
        onClose={() => {
          setSelected(null);
        }}
      />
    </section>
  );
}
