'use client';

import Link from 'next/link';
import { BellIcon } from 'lucide-react';
import { useUnreadCount } from '@/features/communication/api';

/** Header link to the staff notifications, with the real unread count (refreshed every minute). */
export function NotificationsLink() {
  const unread = useUnreadCount('staff').data?.unread ?? 0;
  return (
    <Link
      href="/admin/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-accent"
    >
      <BellIcon aria-hidden="true" className="size-5" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
