'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { ArrowRightIcon, ClipboardCheckIcon, UserRoundPenIcon, WalletIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { useSessionUser } from '@/components/providers/session-context';
import { profileRequestsApi, profileRequestKeys } from '@/features/profile-requests/api';
import { reExamsApi, reExamKeys } from '@/features/re-exams/api';
import { paymentsApi, paymentKeys } from '@/features/re-exam-payments/api';

const PROFILE_QUERY = { status: 'PENDING', pageSize: 1 } as const;
const APPLICATION_QUERY = { status: 'SUBMITTED', pageSize: 1 } as const;
const PAYMENT_QUERY = { status: 'SUBMITTED', pageSize: 1 } as const;

const QUEUES = [
  {
    label: 'Profile requests',
    description: 'Changes awaiting a staff decision',
    href: '/admin/profile-requests',
    status: 'PENDING',
    permission: PERMISSIONS.studentProfileRequestsRead,
    icon: UserRoundPenIcon,
    queryKey: profileRequestKeys.list(PROFILE_QUERY),
    queryFn: async () => (await profileRequestsApi.list(PROFILE_QUERY)).meta.total,
  },
  {
    label: 'Re-exam applications',
    description: 'Applications awaiting a staff decision',
    href: '/admin/re-exam-applications',
    status: 'SUBMITTED',
    permission: PERMISSIONS.reExamApplicationsRead,
    icon: ClipboardCheckIcon,
    queryKey: reExamKeys.list(APPLICATION_QUERY),
    queryFn: async () => (await reExamsApi.list(APPLICATION_QUERY)).meta.total,
  },
  {
    label: 'Payment submissions',
    description: 'Submitted payments awaiting verification',
    href: '/admin/re-exam-payments',
    status: 'SUBMITTED',
    permission: PERMISSIONS.reExamPaymentsRead,
    icon: WalletIcon,
    queryKey: paymentKeys.list(PAYMENT_QUERY),
    queryFn: async () => (await paymentsApi.list(PAYMENT_QUERY)).meta.total,
  },
] as const;

export function PendingWork() {
  const user = useSessionUser();
  const queues = QUEUES.filter((queue) => user.permissions.includes(queue.permission));
  const results = useQueries({
    queries: queues.map((queue) => ({
      queryKey: ['dashboard-pending', ...queue.queryKey],
      queryFn: queue.queryFn,
    })),
  });
  if (!queues.length) return null;
  return (
    <section
      aria-busy={results.some((result) => result.isPending)}
      aria-labelledby="pending-heading"
      className="rounded-xl border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 id="pending-heading" className="text-section-title text-navy-950">
          Pending work
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Queues available to your account.</p>
      </div>
      <ul className="divide-y divide-border">
        {queues.map((queue, index) => {
          const result = results[index];
          if (!result) return null;
          return (
            <li key={queue.href} className="flex items-center gap-3 px-5 py-4">
              <queue.icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <Link
                  href={{ pathname: queue.href, query: { status: queue.status } }}
                  className="rounded-sm text-sm font-medium text-navy-950 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand-accent"
                >
                  {queue.label}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">{queue.description}</p>
              </div>
              {result.isPending ? (
                <Skeleton className="h-7 w-9" />
              ) : result.isError ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void result.refetch()}
                  aria-label={`Retry ${queue.label.toLowerCase()}`}
                >
                  Retry
                </Button>
              ) : (
                <span
                  aria-label={`${result.data} pending ${queue.label.toLowerCase()}`}
                  className="min-w-8 text-right text-xl font-semibold text-navy-950 tabular-nums"
                >
                  {result.data.toLocaleString('en-IN')}
                </span>
              )}
              <ArrowRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
