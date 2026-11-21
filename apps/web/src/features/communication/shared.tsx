'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { BellIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn, StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  MESSAGE_RULES,
  VERIFICATION_QUERY_CATEGORY_LABELS,
  type MessageThreadDetail,
  type MessageThreadStatus,
  type Notification,
  type VerificationQueryStatus,
} from '@docversity/validation';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useMarkRead, useNotifications, useReply, type Side } from './api';

export const THREAD_STATUS: Record<
  MessageThreadStatus,
  { label: string; tone: 'info' | 'neutral' }
> = {
  OPEN: { label: 'Open', tone: 'info' },
  RESOLVED: { label: 'Resolved', tone: 'neutral' },
};
export const QUERY_STATUS: Record<
  VerificationQueryStatus,
  { label: string; tone: 'warning' | 'info' | 'success' }
> = {
  OPEN: { label: 'Awaiting answer', tone: 'warning' },
  ANSWERED: { label: 'Answered', tone: 'info' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
};
export { VERIFICATION_QUERY_CATEGORY_LABELS };

export function UnreadDot({ unread }: { unread: boolean }) {
  return unread ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
      <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
      Unread
    </span>
  ) : null;
}

/** The conversation as a list of messages; text is rendered as text, never HTML. */
export function ThreadMessages({ thread, side }: { thread: MessageThreadDetail; side: Side }) {
  return (
    <ol aria-label="Messages" className="flex flex-col gap-3">
      {thread.messages.map((m) => {
        const mine = (side === 'student') === (m.author === 'STUDENT');
        return (
          <li
            key={m.id}
            className={cn(
              'max-w-[min(42rem,92%)] rounded-2xl border px-4 py-3',
              mine ? 'self-end border-brand/30 bg-info-soft' : 'self-start border-border bg-card',
            )}
          >
            <p className="text-xs font-semibold text-navy-950">
              {m.authorName}
              <span className="ml-2 font-normal text-navy-900">{formatDateTime(m.createdAt)}</span>
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap break-words text-navy-950">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function ReplyBox({
  side,
  threadId,
  disabledReason,
}: {
  side: Side;
  threadId: string;
  disabledReason?: string;
}) {
  const id = useId();
  const [body, setBody] = useState('');
  const reply = useReply(side, threadId);
  return (
    <form
      className="mt-4 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) return;
        reply.mutate(body.trim(), {
          onSuccess: () => {
            setBody('');
            toast.success('Message sent.');
          },
          onError: (error) => toast.error(errorMessage(error)),
        });
      }}
    >
      <label htmlFor={id} className="text-sm font-medium text-navy-950">
        Your reply
      </label>
      <Textarea
        id={id}
        value={body}
        rows={4}
        maxLength={MESSAGE_RULES.bodyMax}
        required
        disabled={Boolean(disabledReason) || reply.isPending}
        aria-describedby={disabledReason ? `${id}-note` : undefined}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />
      {disabledReason && (
        <p id={`${id}-note`} className="text-sm text-muted-foreground">
          {disabledReason}
        </p>
      )}
      <Button type="submit" className="w-fit" disabled={Boolean(disabledReason) || reply.isPending}>
        {reply.isPending ? 'Sending…' : 'Send reply'}
      </Button>
    </form>
  );
}

/** A recipient's own notifications with read state; links open the authorised page. */
export function NotificationList({ side }: { side: Side }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useNotifications(side, {
    page: 1,
    pageSize: 50,
    sortOrder: 'desc',
    ...(unreadOnly ? { unread: 'true' as const } : {}),
  });
  const mark = useMarkRead(side);
  const items: Notification[] = query.data?.data ?? [];
  return (
    <section aria-label="Notifications" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
            }}
          />
          Show unread only
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={mark.isPending || !items.some((n) => !n.readAt)}
          onClick={() => {
            mark.mutate('all', { onError: (error) => toast.error(errorMessage(error)) });
          }}
        >
          Mark all as read
        </Button>
      </div>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          {errorMessage(query.error)}
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-8 text-center">
          <BellIcon aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="font-medium text-navy-950">No notifications yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Replies to your messages and updates on your requests appear here. Notifications are
            shown in the portal only; nothing is sent by email or SMS.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {items.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-navy-950">
                  {n.title}
                  <UnreadDot unread={!n.readAt} />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {n.link && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={n.link as Route}
                      onClick={() => {
                        if (!n.readAt) mark.mutate(n.id);
                      }}
                    >
                      Open
                    </Link>
                  </Button>
                )}
                {!n.readAt && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      mark.mutate(n.id);
                    }}
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StatusPill<T extends string>({
  status,
  map,
}: {
  status: T;
  map: Record<T, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }>;
}) {
  return <StatusBadge tone={map[status].tone}>{map[status].label}</StatusBadge>;
}
