'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useState } from 'react';
import { KeyRoundIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@docversity/ui/components/dropdown-menu';
import type {
  IssuedActivationCodes,
  PortalState,
  StudentAccountRow,
  StudentAccountStatus,
} from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { useSessionOptions } from '@/features/academic-sessions/api';
import { useProgramOptions } from '@/features/programs/api';
import { useListParams } from '@/hooks/use-list-params';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useIssueCodes, useRevokeCodes, useStudentAccounts } from './api';
import { CodesDialog } from './codes-dialog';
import { PORTAL_STATE, PORTAL_STATE_OPTIONS } from './labels';
import { StatusDialog } from './status-dialog';

function Detail({ row }: { row: StudentAccountRow }) {
  if (row.account) {
    return (
      <span className="text-meta">
        {row.account.lastLoginAt
          ? `Last sign-in ${formatDateTime(row.account.lastLoginAt)}`
          : 'Never signed in'}
      </span>
    );
  }
  if (row.openCode) {
    return (
      <span className="text-meta">
        Code valid until {formatDate(row.openCode.expiresAt.slice(0, 10))}
      </span>
    );
  }
  return <span className="text-meta">—</span>;
}

export function StudentAccountsView() {
  const canManage = useCan(PERMISSIONS.studentAccountsManage);
  const { values, page, update } = useListParams([
    'state',
    'program',
    'session',
    'import',
  ] as const);
  const query = useStudentAccounts({
    page,
    search: values.search || undefined,
    state: (values.state || undefined) as PortalState | undefined,
    programId: values.program || undefined,
    academicSessionId: values.session || undefined,
    importJobId: values.import || undefined,
  });
  const programs = useProgramOptions(undefined);
  const sessions = useSessionOptions();
  const issue = useIssueCodes();
  const revoke = useRevokeCodes();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [codes, setCodes] = useState<IssuedActivationCodes | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    row: StudentAccountRow;
    status: StudentAccountStatus;
  } | null>(null);

  const rows = query.data?.data ?? [];
  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.registrationId));

  const issueFor = (body: { registrationIds?: string[]; importJobId?: string }) => {
    issue.mutate(body, {
      onSuccess: (result) => {
        setCodes(result);
        setSelected(new Set());
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const rowActions = (row: StudentAccountRow) =>
    canManage && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Actions for ${row.registrationNumber}`}>
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.account?.status !== 'DISABLED' && (
            <DropdownMenuItem
              onSelect={() => {
                issueFor({ registrationIds: [row.registrationId] });
              }}
            >
              {row.account
                ? 'Issue recovery code'
                : row.openCode
                  ? 'Issue new code'
                  : 'Issue activation code'}
            </DropdownMenuItem>
          )}
          {row.openCode && (
            <DropdownMenuItem
              onSelect={() => {
                revoke.mutate([row.registrationId], {
                  onSuccess: () => toast.success('Activation code revoked.'),
                  onError: (error) => toast.error(errorMessage(error)),
                });
              }}
            >
              Revoke code
            </DropdownMenuItem>
          )}
          {row.account?.status === 'ACTIVE' && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  setStatusTarget({ row, status: 'LOCKED' });
                }}
              >
                Lock account
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setStatusTarget({ row, status: 'DISABLED' });
                }}
              >
                Disable account
              </DropdownMenuItem>
            </>
          )}
          {row.account && row.account.status !== 'ACTIVE' && (
            <DropdownMenuItem
              onSelect={() => {
                setStatusTarget({ row, status: 'ACTIVE' });
              }}
            >
              Re-activate account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const columns: ColumnDef<StudentAccountRow>[] = [
    ...(canManage
      ? [
          {
            id: 'select',
            header: () => (
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-brand)]"
                aria-label="Select all on this page"
                checked={allOnPage}
                onChange={() => {
                  setSelected((current) => {
                    const next = new Set(current);
                    for (const row of rows) {
                      if (allOnPage) next.delete(row.registrationId);
                      else next.add(row.registrationId);
                    }
                    return next;
                  });
                }}
              />
            ),
            cell: ({ row }: { row: { original: StudentAccountRow } }) => (
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-brand)]"
                aria-label={`Select ${row.original.registrationNumber}`}
                checked={selected.has(row.original.registrationId)}
                onChange={() => {
                  toggle(row.original.registrationId);
                }}
              />
            ),
          } satisfies ColumnDef<StudentAccountRow>,
        ]
      : []),
    {
      header: 'Registration number',
      cell: ({ row }) => (
        <span className="font-medium break-all text-navy-950">
          {row.original.registrationNumber}
        </span>
      ),
    },
    {
      header: 'Student',
      cell: ({ row }) => (
        <Link
          href={`/admin/students/${row.original.studentId}`}
          className="font-medium text-brand hover:underline"
        >
          {row.original.studentName}
        </Link>
      ),
    },
    { header: 'Program', cell: ({ row }) => row.original.program.code },
    { header: 'Session', cell: ({ row }) => row.original.academicSession.code },
    {
      header: 'Portal',
      cell: ({ row }) => (
        <StatusBadge tone={PORTAL_STATE[row.original.state].tone}>
          {PORTAL_STATE[row.original.state].label}
        </StatusBadge>
      ),
    },
    { header: 'Details', cell: ({ row }) => <Detail row={row.original} /> },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <div className="flex justify-end">{rowActions(row.original)}</div>,
    },
  ];

  const filtered = Boolean(
    values.search || values.state || values.program || values.session || values.import,
  );

  return (
    <>
      <PageHeader
        title="Student accounts"
        description="Issue activation codes so students can sign in to the student portal, and manage their accounts."
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search student accounts"
          placeholder="Name or registration number"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Portal state"
          allLabel="All states"
          value={values.state}
          onChange={(state) => {
            update({ state });
          }}
          options={PORTAL_STATE_OPTIONS}
        />
        <FilterSelect
          label="Program"
          allLabel="All programs"
          value={values.program}
          onChange={(program) => {
            update({ program });
          }}
          options={programs.programs.map((p) => ({ value: p.id, label: p.code }))}
        />
        <FilterSelect
          label="Session"
          allLabel="All sessions"
          value={values.session}
          onChange={(session) => {
            update({ session });
          }}
          options={sessions.all}
        />
      </div>
      {values.import && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-navy-950">
          <span>Showing registrations from one import.</span>
          {canManage && (
            <Button
              size="sm"
              disabled={issue.isPending}
              onClick={() => {
                issueFor({ importJobId: values.import });
              }}
            >
              <KeyRoundIcon aria-hidden="true" />
              Issue codes for every registration in this import
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              update({ import: '' });
            }}
          >
            <XIcon aria-hidden="true" />
            Show all
          </Button>
        </div>
      )}
      {canManage && selected.size > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
          aria-live="polite"
        >
          <span className="text-navy-950">{selected.size} selected</span>
          <Button
            size="sm"
            disabled={issue.isPending}
            onClick={() => {
              issueFor({ registrationIds: [...selected] });
            }}
          >
            <KeyRoundIcon aria-hidden="true" />
            Issue activation codes
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={revoke.isPending}
            onClick={() => {
              revoke.mutate([...selected], {
                onSuccess: ({ revoked }) => {
                  toast.success(`${revoked} open code${revoked === 1 ? '' : 's'} revoked.`);
                  setSelected(new Set());
                },
                onError: (error) => toast.error(errorMessage(error)),
              });
            }}
          >
            Revoke codes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected(new Set());
            }}
          >
            Clear selection
          </Button>
        </div>
      )}
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'No registrations match these filters' : 'No registrations yet'}
          description={
            filtered ? 'Try a different search or filter.' : 'Add or import students first.'
          }
        />
      ) : (
        <>
          <DataTable
            caption="Student accounts"
            columns={columns}
            data={rows}
            getRowId={(row) => row.registrationId}
            renderCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {canManage && (
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-[var(--color-brand)]"
                        aria-label={`Select ${row.registrationNumber}`}
                        checked={selected.has(row.registrationId)}
                        onChange={() => {
                          toggle(row.registrationId);
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium break-all text-navy-950">
                        {row.registrationNumber}
                      </p>
                      <p className="text-sm">{row.studentName}</p>
                      <p className="text-meta">
                        {row.program.code} · {row.academicSession.code}
                      </p>
                    </div>
                  </div>
                  <StatusBadge tone={PORTAL_STATE[row.state].tone}>
                    {PORTAL_STATE[row.state].label}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Detail row={row} />
                  {rowActions(row)}
                </div>
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
      <CodesDialog
        result={codes}
        onClose={() => {
          setCodes(null);
        }}
      />
      <StatusDialog
        row={statusTarget?.row ?? null}
        target={statusTarget?.status ?? null}
        onClose={() => {
          setStatusTarget(null);
        }}
      />
    </>
  );
}
