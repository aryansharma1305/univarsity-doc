import { AlertTriangleIcon, InboxIcon, LockIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@docversity/ui/components/button';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { ApiError, errorMessage } from '@/lib/api';

function StateFrame({
  icon,
  title,
  children,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  tone?: 'neutral' | 'danger' | 'warning';
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-danger-soft text-danger-text'
      : tone === 'warning'
        ? 'bg-warning-soft text-warning-text'
        : 'bg-muted text-muted-foreground';
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-card px-6 py-12 text-center">
      <span className={`flex size-11 items-center justify-center rounded-full ${toneClass}`}>
        {icon}
      </span>
      <h2 className="text-card-title text-navy-950">{title}</h2>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <StateFrame icon={<InboxIcon aria-hidden="true" className="size-5" />} title={title}>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </StateFrame>
  );
}

export function ForbiddenState() {
  return (
    <StateFrame
      icon={<LockIcon aria-hidden="true" className="size-5" />}
      title="You don’t have access to this"
      tone="warning"
    >
      <p className="max-w-md text-sm text-muted-foreground">
        Your account’s role does not include permission to view this information. Ask a system
        administrator if you need access.
      </p>
    </StateFrame>
  );
}

export function NotFoundState({ what = 'record' }: { what?: string }) {
  return (
    <StateFrame
      icon={<InboxIcon aria-hidden="true" className="size-5" />}
      title={`This ${what} could not be found`}
    >
      <p className="max-w-md text-sm text-muted-foreground">
        It may have been removed, or the link is incorrect.
      </p>
    </StateFrame>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.isForbidden) return <ForbiddenState />;
  if (error instanceof ApiError && error.isNotFound) return <NotFoundState />;
  return (
    <StateFrame
      icon={<AlertTriangleIcon aria-hidden="true" className="size-5" />}
      title="Couldn’t load this"
      tone="danger"
    >
      <p role="alert" className="max-w-md text-sm text-muted-foreground">
        {errorMessage(error)}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" />
          Try again
        </Button>
      )}
    </StateFrame>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="mb-4 h-5 w-1/3" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
