'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCwIcon,
  CalendarRangeIcon,
  GraduationCapIcon,
  type LucideIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import { PERMISSIONS } from '@docversity/types';
import { useState } from 'react';
import { WorkspaceNavigator } from './workspace-navigator';
import { PendingWork, visibleQueues } from './pending-work';
import { Enrolment, RecordsStrip } from './enrolment';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { dashboardSchema } from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState } from '@/components/data/states';
import { useSessionUser } from '@/components/providers/session-context';
import { apiRequest } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  href?: '/admin/students' | '/admin/programs' | '/admin/academic-sessions';
}) {
  const body = (
    <div className="flex h-full flex-col gap-3 px-5 py-5 transition-colors hover:bg-muted/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs leading-tight font-medium text-muted-foreground">{label}</span>
        <span className="hidden shrink-0 text-muted-foreground sm:block">
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
      </div>
      <div>
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight text-navy-950 tabular-nums">
            {value.toLocaleString('en-IN')}
          </p>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-accent"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function DashboardView() {
  const user = useSessionUser();
  const client = useQueryClient();
  const can = (permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) =>
    user.permissions.includes(permission);
  const [academicSessionId, setAcademicSessionId] = useState('');
  const query = useQuery({
    queryKey: ['dashboard', academicSessionId],
    queryFn: () =>
      apiRequest('GET', 'dashboard', dashboardSchema, {
        query: academicSessionId ? { academicSessionId } : {},
      }),
    placeholderData: (previous) => previous,
  });
  const workload = query.data?.workload;
  const hasPending = workload !== undefined && visibleQueues(workload, user.permissions).length > 0;
  const counts = query.data?.counts;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.displayName}`}
        description="An overview of the academic records held in Docversity."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => {
              void client.invalidateQueries({ queryKey: ['dashboard'] });
            }}
          >
            <RefreshCwIcon
              aria-hidden="true"
              className={query.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined}
            />
            Refresh overview
          </Button>
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section
            aria-label="Totals"
            aria-busy={query.isPending}
            className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card xl:grid-cols-4"
          >
            <StatCard
              label="Total students"
              value={counts?.students}
              icon={UsersIcon}
              href={can(PERMISSIONS.studentsRead) ? '/admin/students' : undefined}
            />
            <StatCard
              label="Active registrations"
              value={counts?.activeRegistrations}
              icon={UserCheckIcon}
              href={can(PERMISSIONS.studentsRead) ? '/admin/students' : undefined}
            />
            <StatCard
              label="Active programs"
              value={counts?.programs}
              icon={GraduationCapIcon}
              href={can(PERMISSIONS.programsRead) ? '/admin/programs' : undefined}
            />
            <StatCard
              label="Academic sessions"
              value={counts?.academicSessions}
              icon={CalendarRangeIcon}
              href={can(PERMISSIONS.academicSessionsRead) ? '/admin/academic-sessions' : undefined}
            />
          </section>
          {workload && <RecordsStrip workload={workload} />}
          {query.data?.enrolment && (
            <Enrolment
              enrolment={query.data.enrolment}
              academicSessionId={academicSessionId}
              onSessionChange={setAcademicSessionId}
            />
          )}
          <div className="mt-6">
            <WorkspaceNavigator />
          </div>
          <div className={hasPending ? 'mt-6 grid items-start gap-6 xl:grid-cols-5' : 'mt-6'}>
            {hasPending && (
              <div className="xl:col-span-2">
                <PendingWork workload={workload} />
              </div>
            )}
            {query.data?.recentActivity !== null && (
              <section aria-labelledby="activity-heading" className="xl:col-span-3">
                <h2 id="activity-heading" className="text-section-title mb-3 text-navy-950">
                  Recent activity
                </h2>
                {query.isPending ? (
                  <Skeleton className="h-40 w-full" />
                ) : query.data.recentActivity.length === 0 ? (
                  <EmptyState
                    title="No activity yet"
                    description="Changes to departments, programs, sessions and students will be listed here."
                  />
                ) : (
                  <ol className="divide-y divide-border rounded-xl border border-border bg-card">
                    {query.data.recentActivity.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <span className="text-sm text-foreground">{item.summary}</span>
                        <span className="text-meta shrink-0">
                          {item.actor ?? 'System'} · {formatDateTime(item.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
