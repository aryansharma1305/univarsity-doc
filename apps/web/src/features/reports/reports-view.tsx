'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DownloadIcon, PrinterIcon } from 'lucide-react';
import { useState } from 'react';
import { PERMISSIONS, type Permission } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@docversity/ui/components/select';
import { type ReportName, reportSchema } from '@docversity/validation';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useSessionUser } from '@/components/providers/session-context';
import { useAcademicSessions } from '@/features/academic-sessions/api';
import { useProgramOptions } from '@/features/programs/api';
import { useListParams } from '@/hooks/use-list-params';
import { apiDownload, apiRequest, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type Filter = 'academicSessionId' | 'programId' | 'status' | 'from' | 'to';

/** Each report, its read permission (enforced again by the API) and the filters it accepts. */
export const REPORTS: readonly {
  name: ReportName;
  label: string;
  description: string;
  permission: Permission;
  filters: readonly Filter[];
}[] = [
  {
    name: 'enrolment',
    label: 'Enrolment',
    description: 'Registrations by course, academic session and status.',
    permission: PERMISSIONS.registrationsRead,
    filters: ['academicSessionId', 'programId', 'status'],
  },
  {
    name: 'certificate-requests',
    label: 'Certificate requests',
    description: 'Requests by certificate type and status, by submission date.',
    permission: PERMISSIONS.certificateRequestsRead,
    filters: ['from', 'to'],
  },
  {
    name: 'issued-documents',
    label: 'Official documents',
    description: 'Admission letters and certificates by type and status, by preparation date.',
    permission: PERMISSIONS.certificatesRead,
    filters: ['programId', 'from', 'to'],
  },
  {
    name: 'results',
    label: 'Results',
    description: 'Results by examination and publication status.',
    permission: PERMISSIONS.resultsRead,
    filters: ['academicSessionId', 'programId'],
  },
  {
    name: 're-exam-applications',
    label: 'Re-exam applications',
    description: 'Re-examination applications by examination and status.',
    permission: PERMISSIONS.reExamApplicationsRead,
    filters: ['academicSessionId', 'programId'],
  },
  {
    name: 'verification-activity',
    label: 'Verification activity',
    description: 'Public verification lookups by type and outcome.',
    permission: PERMISSIONS.auditRead,
    filters: ['from', 'to'],
  },
  {
    name: 'student-messages',
    label: 'Student messages',
    description: 'Student conversations by status, by start date.',
    permission: PERMISSIONS.studentMessagesRead,
    filters: ['from', 'to'],
  },
  {
    name: 'verification-queries',
    label: 'Verification queries',
    description: 'Verification queries by source, category and status.',
    permission: PERMISSIONS.verificationQueriesRead,
    filters: ['from', 'to'],
  },
];

const STATUS_OPTIONS = ['ACTIVE', 'COMPLETED', 'SUSPENDED', 'REVOKED'].map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
}));

export function ReportsView() {
  const user = useSessionUser();
  const available = REPORTS.filter((report) => user.permissions.includes(report.permission));
  const { values, update } = useListParams([
    'report',
    'academicSessionId',
    'programId',
    'status',
    'from',
    'to',
  ] as const);
  const report = available.find((r) => r.name === values.report) ?? available[0];
  const query = Object.fromEntries(
    (report?.filters ?? []).flatMap((key) => (values[key] ? [[key, values[key]]] : [])),
  ) as Partial<Record<Filter, string>>;
  const needsSessions = report?.filters.includes('academicSessionId') ?? false;
  const needsPrograms = report?.filters.includes('programId') ?? false;
  const sessions = useAcademicSessions({ pageSize: 100, sortBy: 'startsOn', sortOrder: 'desc' });
  const programs = useProgramOptions(undefined);
  const [downloadError, setDownloadError] = useState('');
  const data = useQuery({
    queryKey: ['reports', report?.name, query],
    queryFn: () => apiRequest('GET', `reports/${report?.name ?? ''}`, reportSchema, { query }),
    enabled: report !== undefined,
    placeholderData: keepPreviousData,
  });

  if (!report)
    return (
      <>
        <PageHeader title="Reports" description="Aggregate counts for university operations." />
        <EmptyState
          title="No reports available"
          description="Your account has no permission for any report. Ask a Super Admin if you need access."
        />
      </>
    );

  const csv = `reports/${report.name}?${new URLSearchParams({ ...query, format: 'csv' }).toString()}`;
  return (
    <>
      <PageHeader
        title="Reports"
        description="Aggregate counts only. Reports never list individual students."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.data}
              onClick={() => {
                setDownloadError('');
                apiDownload(csv, `docversity-${report.name}.csv`).catch((error: unknown) => {
                  setDownloadError(errorMessage(error));
                });
              }}
            >
              <DownloadIcon aria-hidden="true" />
              Download CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.data}
              onClick={() => {
                window.print();
              }}
            >
              <PrinterIcon aria-hidden="true" />
              Print
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end print:hidden">
        <Select
          value={report.name}
          onValueChange={(next) => {
            update({
              report: next,
              academicSessionId: '',
              programId: '',
              status: '',
              from: '',
              to: '',
            });
          }}
        >
          <SelectTrigger aria-label="Report" className="h-10 w-full bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map((r) => (
              <SelectItem key={r.name} value={r.name}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsSessions && (
          <FilterSelect
            label="Academic session"
            allLabel="All sessions"
            value={values.academicSessionId}
            onChange={(next) => {
              update({ academicSessionId: next });
            }}
            options={(sessions.data?.data ?? []).map((s) => ({ value: s.id, label: s.code }))}
          />
        )}
        {needsPrograms && (
          <FilterSelect
            label="Course"
            allLabel="All courses"
            value={values.programId}
            onChange={(next) => {
              update({ programId: next });
            }}
            options={programs.options}
          />
        )}
        {report.filters.includes('status') && (
          <FilterSelect
            label="Registration status"
            allLabel="All statuses"
            value={values.status}
            onChange={(next) => {
              update({ status: next });
            }}
            options={STATUS_OPTIONS}
          />
        )}
        {report.filters.includes('from') &&
          (['from', 'to'] as const).map((key) => (
            <div key={key} className="grid gap-1">
              <Label htmlFor={`report-${key}`}>{key === 'from' ? 'From (UTC)' : 'To (UTC)'}</Label>
              <Input
                id={`report-${key}`}
                type="date"
                className="h-10 bg-card sm:w-44"
                value={values[key]}
                onChange={(event) => {
                  update({ [key]: event.target.value });
                }}
              />
            </div>
          ))}
      </div>
      {downloadError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {downloadError}
        </p>
      )}
      <section data-print-area aria-labelledby="report-heading" className="grid gap-3">
        <div>
          <h2 id="report-heading" className="text-section-title text-navy-950">
            {report.label}
          </h2>
          <p className="text-sm text-muted-foreground">{report.description}</p>
        </div>
        {data.isError ? (
          <ErrorState error={data.error} onRetry={() => void data.refetch()} />
        ) : !data.data ? (
          <TableSkeleton />
        ) : data.data.rows.length === 0 ? (
          <EmptyState title="No records" description="Nothing matches these filters." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">{report.label} report</caption>
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    {data.data.columns.map((column, index) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={`px-3 py-2 ${index === data.data.columns.length - 1 ? 'text-right' : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.data.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {data.data.columns.map((column, index) => (
                        <td
                          key={column.key}
                          className={`px-3 py-2 ${index === data.data.columns.length - 1 ? 'text-right font-medium tabular-nums' : ''}`}
                        >
                          {row[column.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <th
                      scope="row"
                      colSpan={data.data.columns.length - 1}
                      className="px-3 py-2 text-left"
                    >
                      Total
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {data.data.total.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-meta">Generated {formatDateTime(data.data.generatedAt)}</p>
          </>
        )}
      </section>
    </>
  );
}
