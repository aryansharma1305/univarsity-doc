'use client';

import Link from 'next/link';
import type { Route } from 'next';
import {
  ArrowRightIcon,
  ClipboardCheckIcon,
  FileCheck2Icon,
  FileSignatureIcon,
  LifeBuoyIcon,
  type LucideIcon,
  MessagesSquareIcon,
  ScrollTextIcon,
  UserRoundPenIcon,
  WalletIcon,
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '@docversity/types';
import type { Dashboard } from '@docversity/validation';
import { useSessionUser } from '@/components/providers/session-context';

type Workload = Dashboard['workload'];

const QUEUES: readonly {
  key: keyof Workload;
  label: string;
  description: string;
  href: Route;
  icon: LucideIcon;
  /** The permission that acts on the queue; read-only accounts are not shown it as their work. */
  act: Permission;
}[] = [
  {
    key: 'profileRequestsPending',
    act: PERMISSIONS.studentProfileRequestsReview,
    label: 'Profile requests',
    description: 'Changes awaiting a staff decision',
    href: '/admin/profile-requests?status=PENDING',
    icon: UserRoundPenIcon,
  },
  {
    key: 'certificateRequestsAwaitingStaff',
    act: PERMISSIONS.certificateRequestsReview,
    label: 'Certificate requests',
    description: 'Submitted, in review or with new information from the student',
    href: '/admin/certificate-requests',
    icon: FileSignatureIcon,
  },
  {
    key: 'reExamApplicationsPending',
    act: PERMISSIONS.reExamApplicationsDecide,
    label: 'Re-exam applications',
    description: 'Applications awaiting a staff decision',
    href: '/admin/re-exam-applications?status=SUBMITTED',
    icon: ClipboardCheckIcon,
  },
  {
    key: 'reExamPaymentsPending',
    act: PERMISSIONS.reExamPaymentsVerify,
    label: 'Payment submissions',
    description: 'Submitted payments awaiting verification',
    href: '/admin/re-exam-payments?status=SUBMITTED',
    icon: WalletIcon,
  },
  {
    key: 'resultsUnderReview',
    act: PERMISSIONS.resultsReview,
    label: 'Results under review',
    description: 'Submitted marks versions awaiting review',
    href: '/admin/results/review',
    icon: ScrollTextIcon,
  },
  {
    key: 'documentsAwaitingApproval',
    act: PERMISSIONS.certificatesApprove,
    label: 'Documents awaiting approval',
    description: 'Prepared official documents awaiting an independent approval',
    href: '/admin/official-records?tab=documents',
    icon: FileCheck2Icon,
  },
  {
    key: 'messagesAwaitingReply',
    act: PERMISSIONS.studentMessagesRespond,
    label: 'Student messages',
    description: 'Open conversations with unread student messages',
    href: '/admin/messages?status=OPEN&unread=true',
    icon: MessagesSquareIcon,
  },
  {
    key: 'verificationQueriesOpen',
    act: PERMISSIONS.verificationQueriesRespond,
    label: 'Verification queries',
    description: 'Open queries awaiting a response',
    href: '/admin/verification-queries?status=OPEN',
    icon: LifeBuoyIcon,
  },
];

/** Queues awaiting staff action: shown only when the user may read (non-null) and act on them. */
export function visibleQueues(workload: Workload, permissions: readonly string[]) {
  return QUEUES.flatMap((queue) => {
    const value = workload[queue.key];
    return value === null || !permissions.includes(queue.act) ? [] : [{ ...queue, value }];
  });
}

export function PendingWork({ workload }: { workload: Workload }) {
  const user = useSessionUser();
  const queues = visibleQueues(workload, user.permissions);
  if (!queues.length) return null;
  return (
    <section aria-labelledby="pending-heading" className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id="pending-heading" className="text-section-title text-navy-950">
          Pending work
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Queues available to your account.</p>
      </div>
      <ul className="divide-y divide-border">
        {queues.map((queue) => (
          <li key={queue.key} className="flex items-center gap-3 px-5 py-4">
            <queue.icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Link
                href={queue.href}
                className="rounded-sm text-sm font-medium text-navy-950 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand-accent"
              >
                {queue.label}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">{queue.description}</p>
            </div>
            <span
              aria-label={`${queue.value} pending ${queue.label.toLowerCase()}`}
              className="min-w-8 text-right text-xl font-semibold text-navy-950 tabular-nums"
            >
              {queue.value.toLocaleString('en-IN')}
            </span>
            <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </li>
        ))}
      </ul>
    </section>
  );
}
