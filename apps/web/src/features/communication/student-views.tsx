'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LifeBuoyIcon, MessagesSquareIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  MESSAGE_RULES,
  VERIFICATION_QUERY_CATEGORIES,
  type VerificationQueryCategory,
} from '@docversity/validation';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageIntro, PortalCard, PortalEmptyState } from '@/features/student-portal/portal-ui';
import { useOwnQueries, useStartThread, useSubmitOwnQuery, useThread, useThreads } from './api';
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

function NewMessageForm() {
  const id = useId();
  const router = useRouter();
  const start = useStartThread();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate(
          { subject: subject.trim(), body: body.trim() },
          {
            onSuccess: (thread) => {
              toast.success('Message sent to the administration.');
              router.push(`/student/messages/${thread.id}`);
            },
            onError: (error) => toast.error(errorMessage(error)),
          },
        );
      }}
    >
      <label htmlFor={`${id}-subject`} className="text-sm font-medium text-navy-950">
        Subject
      </label>
      <Input
        id={`${id}-subject`}
        value={subject}
        required
        maxLength={MESSAGE_RULES.subjectMax}
        onChange={(event) => {
          setSubject(event.target.value);
        }}
      />
      <label htmlFor={`${id}-body`} className="text-sm font-medium text-navy-950">
        Message
      </label>
      <Textarea
        id={`${id}-body`}
        value={body}
        rows={5}
        required
        maxLength={MESSAGE_RULES.bodyMax}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Do not include passwords, activation codes or identity document numbers.
      </p>
      <Button type="submit" className="w-fit" disabled={start.isPending}>
        {start.isPending ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}

export function StudentMessages() {
  const threads = useThreads('student', { page: 1, pageSize: 50, sortOrder: 'desc' });
  return (
    <>
      <PageIntro
        title="Messages"
        description="Private conversations with the university administration."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <PortalCard title="Your conversations" icon={MessagesSquareIcon}>
          <div className="p-5 sm:p-6">
            {threads.isPending ? (
              <p className="text-sm text-muted-foreground">Loading conversations…</p>
            ) : threads.isError ? (
              <p role="alert" className="text-sm text-danger-text">
                {errorMessage(threads.error)}
              </p>
            ) : threads.data.data.length === 0 ? (
              <PortalEmptyState
                icon={MessagesSquareIcon}
                title="No messages yet"
                description="Start a conversation with the administration using the form."
              />
            ) : (
              <ul className="divide-y divide-border">
                {threads.data.data.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/student/messages/${t.id}`}
                        className="font-medium break-words text-brand hover:underline"
                      >
                        {t.subject}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Last message {formatDateTime(t.lastMessageAt)}
                      </p>
                    </div>
                    <span className="flex items-center gap-3">
                      <UnreadDot unread={t.unread} />
                      <StatusPill status={t.status} map={THREAD_STATUS} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PortalCard>
        <PortalCard title="New message">
          <div className="p-5 sm:p-6">
            <NewMessageForm />
          </div>
        </PortalCard>
      </div>
    </>
  );
}

export function StudentThread({ threadId }: { threadId: string }) {
  const thread = useThread('student', threadId);
  return (
    <>
      <PageIntro title={thread.data?.subject ?? 'Conversation'} />
      <p className="mb-4">
        <Link href="/student/messages" className="text-sm text-brand underline underline-offset-4">
          Back to messages
        </Link>
      </p>
      {thread.isPending ? (
        <p className="text-sm text-muted-foreground">Loading conversation…</p>
      ) : thread.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          {errorMessage(thread.error)}
        </p>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <StatusPill status={thread.data.status} map={THREAD_STATUS} />
            {thread.data.status === 'RESOLVED' && (
              <span className="text-sm text-muted-foreground">
                Replying reopens this conversation.
              </span>
            )}
          </div>
          <ThreadMessages thread={thread.data} side="student" />
          <ReplyBox side="student" threadId={threadId} />
        </section>
      )}
    </>
  );
}

export function StudentNotifications() {
  return (
    <>
      <PageIntro title="Notifications" description="Updates from the university, in the portal." />
      <NotificationList side="student" />
    </>
  );
}

function QueryForm() {
  const id = useId();
  const submit = useSubmitOwnQuery();
  const [category, setCategory] = useState<VerificationQueryCategory>('RECORD_NOT_FOUND');
  const [documentReference, setDocumentReference] = useState('');
  const [message, setMessage] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit.mutate(
          {
            category,
            documentReference: documentReference.trim() || null,
            message: message.trim(),
          },
          {
            onSuccess: (q) => {
              toast.success(`Query ${q.reference} submitted.`);
              setDocumentReference('');
              setMessage('');
            },
            onError: (error) => toast.error(errorMessage(error)),
          },
        );
      }}
    >
      <label htmlFor={`${id}-category`} className="text-sm font-medium text-navy-950">
        What do you need help with?
      </label>
      <select
        id={`${id}-category`}
        className="min-h-11 rounded-md border border-input bg-background px-3"
        value={category}
        onChange={(event) => {
          setCategory(event.target.value as VerificationQueryCategory);
        }}
      >
        {VERIFICATION_QUERY_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {VERIFICATION_QUERY_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-doc`} className="text-sm font-medium text-navy-950">
        Document number (optional)
      </label>
      <Input
        id={`${id}-doc`}
        value={documentReference}
        maxLength={100}
        onChange={(event) => {
          setDocumentReference(event.target.value);
        }}
      />
      <label htmlFor={`${id}-message`} className="text-sm font-medium text-navy-950">
        Your query
      </label>
      <Textarea
        id={`${id}-message`}
        value={message}
        rows={5}
        required
        maxLength={MESSAGE_RULES.bodyMax}
        onChange={(event) => {
          setMessage(event.target.value);
        }}
      />
      <Button type="submit" className="w-fit" disabled={submit.isPending}>
        {submit.isPending ? 'Submitting…' : 'Submit query'}
      </Button>
    </form>
  );
}

export function StudentVerificationQueries() {
  const queries = useOwnQueries();
  return (
    <>
      <PageIntro
        title="Verification Queries"
        description="Ask the university about verifying your records. Answers appear here."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <PortalCard title="Your queries" icon={LifeBuoyIcon}>
          <div className="p-5 sm:p-6">
            {queries.isPending ? (
              <p className="text-sm text-muted-foreground">Loading queries…</p>
            ) : queries.isError ? (
              <p role="alert" className="text-sm text-danger-text">
                {errorMessage(queries.error)}
              </p>
            ) : queries.data.data.length === 0 ? (
              <PortalEmptyState
                icon={LifeBuoyIcon}
                title="No queries yet"
                description="Submit a query if a record cannot be verified or its details look wrong."
              />
            ) : (
              <ul className="divide-y divide-border">
                {queries.data.data.map((q) => (
                  <li key={q.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-navy-950">
                        {q.reference} · {VERIFICATION_QUERY_CATEGORY_LABELS[q.category]}
                      </p>
                      <StatusPill status={q.status} map={QUERY_STATUS} />
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap break-words text-muted-foreground">
                      {q.message}
                    </p>
                    {q.response && (
                      <div className="mt-2 rounded-lg bg-info-soft p-3 text-sm">
                        <p className="font-medium text-navy-950">University answer</p>
                        <p className="mt-1 whitespace-pre-wrap break-words">{q.response}</p>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted {formatDateTime(q.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PortalCard>
        <PortalCard title="New query">
          <div className="p-5 sm:p-6">
            <QueryForm />
          </div>
        </PortalCard>
      </div>
    </>
  );
}
