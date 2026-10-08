import { cn } from '../lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const TONES: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success-text ring-success/25',
  warning: 'bg-warning-soft text-warning-text ring-warning/30',
  danger: 'bg-danger-soft text-danger-text ring-danger/25',
  info: 'bg-info-soft text-navy-900 ring-brand/20',
  neutral: 'bg-muted text-muted-foreground ring-border-strong',
};

const DOTS: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-brand',
  neutral: 'bg-muted-foreground',
};

/**
 * Status chip: always shows the status as TEXT (colour is never the only signal), with a tone
 * colour and dot for scanning.
 */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 whitespace-nowrap ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOTS[tone])} />
      {children}
    </span>
  );
}
