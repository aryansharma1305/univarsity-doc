'use client';

import type { Dashboard } from '@docversity/validation';
import { FilterSelect } from '@/components/data/filter-select';

type Row = NonNullable<Dashboard['enrolment']>['byProgram'][number];

/** Horizontal bars scaled to the largest value; the number is always shown as text. */
function BarList({ label, rows, empty }: { label: string; rows: Row[]; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.activeRegistrations));
  if (!rows.length) return <p className="px-5 py-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol aria-label={label} className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id} className="grid grid-cols-[minmax(0,1fr)] gap-1.5 px-5 py-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate" title={`${row.code} — ${row.name}`}>
              <span className="font-medium text-navy-950">{row.code}</span>{' '}
              <span className="text-muted-foreground">{row.name}</span>
            </span>
            <span className="shrink-0 font-semibold text-navy-950 tabular-nums">
              {row.activeRegistrations.toLocaleString('en-IN')}
            </span>
          </div>
          <div aria-hidden="true" className="h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(row.activeRegistrations / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Active registrations per course (optionally one session) and per session. */
export function Enrolment({
  enrolment,
  academicSessionId,
  onSessionChange,
}: {
  enrolment: NonNullable<Dashboard['enrolment']>;
  academicSessionId: string;
  onSessionChange: (value: string) => void;
}) {
  return (
    <section
      aria-labelledby="enrolment-heading"
      className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2"
    >
      <div className="min-w-0 rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="enrolment-heading" className="text-section-title text-navy-950">
            Active registrations by course
          </h2>
          <FilterSelect
            label="Academic session"
            allLabel="All sessions"
            value={academicSessionId}
            onChange={onSessionChange}
            options={enrolment.bySession.map((row) => ({ value: row.id, label: row.code }))}
          />
        </div>
        <BarList
          label="Active registrations by course"
          rows={enrolment.byProgram}
          empty="No active registrations in this session."
        />
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-card">
        <h2 className="text-section-title border-b border-border px-5 py-4 text-navy-950">
          Active registrations by academic session
        </h2>
        <BarList
          label="Active registrations by academic session"
          rows={enrolment.bySession}
          empty="No active registrations yet."
        />
      </div>
    </section>
  );
}

const RECORDS = [
  ['resultsDraft', 'Draft results'],
  ['resultsPublished', 'Published results'],
  ['documentsIssued', 'Documents issued'],
  ['admissionLettersIssued', 'Admission letters issued'],
] as const;

/** Record totals the user may read; counts without permission (null) are left out. */
export function RecordsStrip({ workload }: { workload: Dashboard['workload'] }) {
  const items = RECORDS.flatMap(([key, label]) => {
    const value = workload[key];
    return value === null ? [] : [{ key, label, value }];
  });
  if (!items.length) return null;
  return (
    <section
      aria-label="Records"
      className="mt-6 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-5 py-4"
    >
      {items.map((item) => (
        <p key={item.key} className="flex items-baseline gap-2 text-sm">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="text-lg font-semibold text-navy-950 tabular-nums">
            {item.value.toLocaleString('en-IN')}
          </span>
        </p>
      ))}
    </section>
  );
}
