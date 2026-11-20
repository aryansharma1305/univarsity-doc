import Image from 'next/image';
import { cn } from '@docversity/ui';
import logo from '@/features/public-verification/university-logo.png';

/** Docversity mark: the official university logo (decorative beside the visible name). */
export function DocversityMark({ className }: { className?: string }) {
  return (
    <Image
      src={logo}
      alt=""
      aria-hidden="true"
      width={64}
      height={68}
      className={cn('size-8 shrink-0 object-contain', className)}
    />
  );
}

export function Wordmark({
  inverted = false,
  adaptive = false,
  large = false,
  subtitle = true,
}: {
  inverted?: boolean;
  /** Follow the landing page's light/dark tokens instead of a fixed colour (public header). */
  adaptive?: boolean;
  /** Slightly larger mark and name (public header). */
  large?: boolean;
  subtitle?: boolean;
}) {
  return (
    <span className={cn('flex items-center', large ? 'gap-3' : 'gap-2.5')}>
      <DocversityMark className={large ? 'size-9' : undefined} />
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            'font-heading font-bold tracking-tight',
            large ? 'text-[1.1875rem]' : 'text-base',
            inverted ? 'text-white' : adaptive ? 'text-lp-ink' : 'text-navy-950',
          )}
        >
          Docversity
        </span>
        {subtitle && (
          <span
            className={cn(
              'text-[0.6875rem] font-medium uppercase',
              large ? 'tracking-[0.12em]' : 'tracking-wide',
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
