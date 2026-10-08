import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@docversity/ui';
import type { StudentNavHref } from './nav';

/** Card used across the student portal: icon + title header, optional action link. */
export function PortalCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  headingLevel = 2,
}: {
  title: string;
  icon?: LucideIcon;
  action?: { href: StudentNavHref; label: string };
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={cn('flex flex-col rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
              <Icon aria-hidden="true" className="size-4" />
            </span>
          )}
          <Heading className="text-card-title break-words text-navy-950">{title}</Heading>
        </div>
        {action && (
          <Link
            href={action.href}
            className="shrink-0 rounded text-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {action.label}
          </Link>
        )}
      </div>
      <div className="flex flex-1 flex-col px-5 py-4">{children}</div>
    </section>
  );
}

/** Label/value rows. Missing values are shown honestly, never invented. */
export function DetailList({
  items,
  columns = 1,
}: {
  items: { label: string; value: string | null | undefined; missing?: string }[];
  columns?: 1 | 2;
}) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 text-sm', columns === 2 && 'sm:grid-cols-2')}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'min-w-0 break-words',
              item.value ? 'font-medium text-navy-950' : 'text-muted-foreground italic',
            )}
          >
            {item.value?.trim() ? item.value : (item.missing ?? 'Not on record')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Honest empty / not-yet-available state inside a card or page. */
export function PortalEmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="font-medium text-navy-950">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

/** Compact "Soon" marker for planned modules. `onDark` is for the navy sidebar. */
export function SoonBadge({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-px text-[0.625rem] leading-4 font-semibold tracking-wide uppercase',
        onDark
          ? 'bg-white/10 text-white ring-1 ring-white/25'
          : 'bg-warning-soft text-warning-text',
      )}
    >
      Soon
    </span>
  );
}

export function PageIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-page-title text-navy-950">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
