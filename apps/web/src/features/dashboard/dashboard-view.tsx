'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarRangeIcon,
  GraduationCapIcon,
  type LucideIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@docversity/ui/components/card';
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
    <Card className="h-full gap-3 shadow-card transition hover:border-brand/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm leading-tight font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-brand sm:flex">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </CardHeader>
      <CardContent>
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="font-heading text-2xl font-bold text-navy-950 tabular sm:text-3xl">
            {value.toLocaleString('en-IN')}
          </p>
        )}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DashboardView() {
  const user = useSessionUser();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest('GET', 'dashboard', dashboardSchema),
  });
  const counts = query.data?.counts;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.displayName}`}
        description="An overview of the academic records held in Docversity."
      />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Total students"
              value={counts?.students}
              icon={UsersIcon}
              href="/admin/students"
            />
            <StatCard
              label="Active registrations"
              value={counts?.activeRegistrations}
              icon={UserCheckIcon}
              href="/admin/students"
            />
            <StatCard
              label="Active programs"
              value={counts?.programs}
              icon={GraduationCapIcon}
              href="/admin/programs"
            />
            <StatCard
              label="Academic sessions"
              value={counts?.academicSessions}
              icon={CalendarRangeIcon}
              href="/admin/academic-sessions"
            />
          </section>
          {query.data?.recentActivity !== null && (
            <section aria-labelledby="activity-heading" className="mt-8">
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
                <ol className="divide-y divide-border rounded-lg border border-border bg-card shadow-card">
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
        </>
      )}
    </>
  );
}
