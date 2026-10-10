import { cn } from '@docversity/ui';

/** Docversity mark: a simple shield monogram (no university crest — none has been supplied). */
export function DocversityMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <path
        d="M16 2 4 6.5v8.7c0 7.4 5.1 12.7 12 14.8 6.9-2.1 12-7.4 12-14.8V6.5L16 2Z"
        fill="#071F4A"
      />
      <path
        d="M16 4.6 6.4 8.2v7c0 6.1 4.1 10.6 9.6 12.5 5.5-1.9 9.6-6.4 9.6-12.5v-7L16 4.6Z"
        fill="none"
        stroke="#D4AF7A"
        strokeWidth="1.2"
      />
      <path
        d="M11.5 10.5h4.2c3.4 0 5.8 2.2 5.8 5.5s-2.4 5.5-5.8 5.5h-4.2v-11Zm2.6 2.3v6.4h1.5c1.9 0 3.2-1.3 3.2-3.2s-1.3-3.2-3.2-3.2h-1.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function Wordmark({
  inverted = false,
  adaptive = false,
  subtitle = true,
}: {
  inverted?: boolean;
  /** Follow the landing page's light/dark tokens instead of a fixed colour (public header). */
  adaptive?: boolean;
  subtitle?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <DocversityMark />
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            'font-heading text-base font-bold tracking-tight',
            inverted ? 'text-white' : adaptive ? 'text-lp-ink' : 'text-navy-950',
          )}
        >
          Docversity
        </span>
        {subtitle && (
          <span
            className={cn(
              'text-[0.6875rem] font-medium tracking-wide uppercase',
              inverted ? 'text-white/70' : adaptive ? 'text-lp-ink-soft' : 'text-muted-foreground',
            )}
          >
            Academic Records
          </span>
        )}
      </span>
    </span>
  );
}
