'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  MESSAGE_RULES,
  type MessageThreadStatus,
  type VerificationQueryStatus,
} from '@docversity/validation';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { useListParams } from '@/hooks/use-list-params';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  useMarkThreadRead,
  useResolveQuery,
  useRespondQuery,
  useStaffQueries,
  useStaffQuery,
  useThread,
  useThreads,
  useThreadStatus,
} from './api';
import {
  NotificationList,
  QUERY_STATUS,
  ReplyBox,
  StatusPill,
  THREAD_STATUS,
  ThreadMessages,
  UnreadDot,
  VERIFICATION_QUERY_CATEGORY_LABELS,
} from './shared';

export function StaffMessagesView() {
  const { values, page, update } = useListParams(['status', 'unread'] as const);
  const status = (values.status || undefined) as MessageThreadStatus | undefined;
  const query = useThreads('staff', {
    page,
    search: values.search || undefined,
    status,
    unread: values.unread === 'true' ? 'true' : undefined,
    sortOrder: 'desc',
  });
  return (
    <>
      <PageHeader
        title="Student Messages"
        description="Private conversations started by students. Replies appear in the student’s portal."
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search messages"
          placeholder="Subject or student name"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Status"
          allLabel="All statuses"
          value={values.status}
          onChange={(next) => {
            update({ status: next });
          }}
          options={[
            { value: 'OPEN', label: 'Open' },
            { value: 'RESOLVED', label: 'Resolved' },
          ]}
        />
        <FilterSelect
          label="Read state"
          allLabel="Read and unread"
          value={values.unread}
          onChange={(next) => {
            update({ unread: next });
          }}
          options={[{ value: 'true', label: 'Unread only' }]}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title="No conversations"
          description="Messages students send from the student portal appear here."
        />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {query.data.data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/messages/${t.id}`}
                    className="font-medium break-words text-brand hover:underline"
                  >
                    {t.subject}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {t.student?.fullName}
                    {t.student?.registrationNumber
                      ? ` · ${t.student.registrationNumber}`
                      : ''} · {formatDateTime(t.lastMessageAt)}
                  </p>
                </div>
                <span className="flex items-center gap-3">
                  <UnreadDot unread={t.unread} />
                  <StatusPill status={t.status} map={THREAD_STATUS} />
                </span>
              </li>
            ))}
          </ul>
          <Pagination
            meta={query.data.meta}
            onPageChange={(next) => {
              update({ page: String(next) });
            }}
          />
        </>
      )}
    </>
  );
}

export function StaffThreadView({ threadId }: { threadId: string }) {
  const thread = useThread('staff', threadId);
  useMarkThreadRead('staff', threadId, thread.data?.unread);
  const canRespond = useCan(PERMISSIONS.studentMessagesRespond);
  const status = useThreadStatus(threadId);
  if (thread.isPending) return <TableSkeleton />;
  if (thread.isError)
    return <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />;
  const t = thread.data;
  const resolved = t.status === 'RESOLVED';
  return (
    <>
      <PageHeader
        title={t.subject}
        description={`${t.student?.fullName ?? 'Student'}${t.student?.registrationNumber ? ` · ${t.student.registrationNumber}` : ''}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusPill status={t.status} map={THREAD_STATUS} />
        {canRespond && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={status.isPending}
            onClick={() => {
              status.mutate(resolved ? 'reopen' : 'resolve', {
                onSuccess: () =>
                  toast.success(resolved ? 'Conversation reopened.' : 'Conversation resolved.'),
                onError: (error) => toast.error(errorMessage(error)),
              });
            }}
          >
            {resolved ? 'Reopen' : 'Mark resolved'}
          </Button>
        )}
        {t.student && (
          <Link href={`/admin/students/${t.student.id}`} className="text-sm text-brand underline">
            Student record
          </Link>
        )}
      </div>
      <section className="rounded-xl border border-border bg-card p-5">
        <ThreadMessages thread={t} side="staff" />
        {canRespond && (
          <ReplyBox
            side="staff"
            threadId={threadId}
            disabledReason={resolved ? 'Reopen this conversation to reply.' : undefined}
          />
        )}
      </section>
    </>
  );
}

export function StaffVerificationQueriesView() {
  const { values, page, update } = useListParams(['status', 'source'] as const);
  const query = useStaffQueries({
    page,
    search: values.search || undefined,
    status: (values.status || undefined) as VerificationQueryStatus | undefined,
    source: (values.source || undefined) as 'STUDENT' | 'PUBLIC' | undefined,
    sortOrder: 'desc',
  });
  return (
    <>
      <PageHeader
        title="Verification Queries"
        description="Support queries from students and external verifiers. Answers are shown to the requester."
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search queries"
          placeholder="Reference or requester name"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Status"
          allLabel="All statuses"
          value={values.status}
          onChange={(next) => {
            update({ status: next });
          }}
          options={Object.entries(QUERY_STATUS).map(([value, { label }]) => ({ value, label }))}
        />
        <FilterSelect
          label="Source"
          allLabel="All sources"
          value={values.source}
          onChange={(next) => {
            update({ source: next });
          }}
          options={[
            { value: 'STUDENT', label: 'Students' },
            { value: 'PUBLIC', label: 'Public' },
          ]}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState title="No verification queries" description="New queries appear here." />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {query.data.data.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/verification-queries/${q.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {q.reference} · {VERIFICATION_QUERY_CATEGORY_LABELS[q.category]}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {q.requesterName} · {q.source === 'PUBLIC' ? 'Public' : 'Student'} ·{' '}
                    {formatDateTime(q.createdAt)}
                  </p>
                </div>
                <StatusPill status={q.status} map={QUERY_STATUS} />
              </li>
            ))}
          </ul>
          <Pagination
            meta={query.data.meta}
            onPageChange={(next) => {
              update({ page: String(next) });
            }}
          />
        </>
      )}
    </>
  );
}

export function StaffVerificationQueryView({ queryId }: { queryId: string }) {
  const id = useId();
  const query = useStaffQuery(queryId);
  const canRespond = useCan(PERMISSIONS.verificationQueriesRespond);
  const respond = useRespondQuery(queryId);
  const resolve = useResolveQuery(queryId);
  const [response, setResponse] = useState('');
  const [close, setClose] = useState(false);
  if (query.isPending) return <TableSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const q = query.data;
  const rows: [string, string | null][] = [
    ['Reference', q.reference],
    ['Source', q.source === 'PUBLIC' ? 'Public requester' : 'Student'],
    ['Requester', q.requesterName],
    ['Organization', q.organization],
    ['Contact email', q.contactEmail],
    ['Category', VERIFICATION_QUERY_CATEGORY_LABELS[q.category]],
    ['Document number given', q.documentReference],
    ['Submitted', formatDateTime(q.createdAt)],
  ];
  return (
    <>
      <PageHeader
        title={`Query ${q.reference}`}
        description={VERIFICATION_QUERY_CATEGORY_LABELS[q.category]}
      />
      <div className="mb-4 flex items-center gap-3">
        <StatusPill status={q.status} map={QUERY_STATUS} />
        {q.student && (
          <Link href={`/admin/students/${q.student.id}`} className="text-sm text-brand underline">
            Student record
          </Link>
        )}
      </div>
      <dl className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="break-words text-navy-950">{value}</dd>
            </div>
          ))}
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted-foreground">Query</dt>
          <dd className="whitespace-pre-wrap break-words text-navy-950">{q.message}</dd>
        </div>
        {q.response && (
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted-foreground">
              Answer{q.respondedAt ? ` (${formatDateTime(q.respondedAt)})` : ''}
            </dt>
            <dd className="whitespace-pre-wrap break-words text-navy-950">{q.response}</dd>
          </div>
        )}
      </dl>
      {canRespond && q.status === 'ANSWERED' && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            The answer is final once given. Resolve the query when no further action is needed.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={resolve.isPending}
            onClick={() => {
              resolve.mutate(q.version, {
                onSuccess: () => toast.success('Query resolved.'),
                onError: (error) => toast.error(errorMessage(error)),
              });
            }}
          >
            Resolve query
          </Button>
        </div>
      )}
      {canRespond && q.status === 'OPEN' && (
        <form
          className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            respond.mutate(
              { response: response.trim(), resolve: close, version: q.version },
              {
                onSuccess: () => {
                  setResponse('');
                  toast.success('Answer saved and shown to the requester.');
                },
                onError: (error) => toast.error(errorMessage(error)),
              },
            );
          }}
        >
          <label htmlFor={`${id}-answer`} className="font-medium text-navy-950">
            Answer
          </label>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            The requester sees this answer. Never include student records, marks or personal details
            the requester did not already provide.
          </p>
          <Textarea
            id={`${id}-answer`}
            rows={5}
            required
            maxLength={MESSAGE_RULES.bodyMax}
            value={response}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setResponse(event.target.value);
            }}
          />
          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={close}
              onChange={(event) => {
                setClose(event.target.checked);
              }}
            />
            Mark resolved after answering
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={respond.isPending}>
              {respond.isPending ? 'Saving…' : 'Save answer'}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

export function StaffNotificationsView() {
  return (
    <>
      <PageHeader title="Notifications" description="Your own in-app notifications." />
      <NotificationList side="staff" />
    </>
  );
}
