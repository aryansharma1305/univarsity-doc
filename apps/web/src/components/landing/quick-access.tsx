import Link from 'next/link';
import { ArrowUpRightIcon } from 'lucide-react';
import { cn } from '@docversity/ui';
import { type QuickLink, PUBLIC_SERVICES, STUDENT_LINKS } from './content';
import { AvailabilityBadge, Reveal } from './primitives';

function QuickRow({ link }: { link: QuickLink }) {
  const upcoming = link.availability === 'upcoming';
  return (
    <li>
      <Link
        href={link.href}
        className="group flex items-start gap-3.5 rounded-lg px-3 py-3 transition-colors hover:bg-lp-accent-tint/60"
      >
        <span
          className={cn(
            'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1',
            upcoming
              ? 'bg-lp-surface text-lp-ink-soft ring-lp-hairline-strong'
              : 'bg-lp-accent-tint text-lp-accent ring-lp-accent/15',
          )}
        >
          <link.icon aria-hidden="true" className="size-[1.125rem]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[0.9375rem] font-semibold tracking-tight text-lp-ink">
              {link.title}
            </span>
            {upcoming && <AvailabilityBadge availability="upcoming" />}
          </span>
          <span className="text-sm leading-snug text-lp-ink-soft">{link.description}</span>
        </span>
        <ArrowUpRightIcon
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-lp-ink-soft/50 transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-lp-accent"
        />
      </Link>
    </li>
  );
}

function Column({
  title,
  note,
  links,
  delay,
}: {
  title: string;
  note: string;
  links: readonly QuickLink[];
  delay: number;
}) {
  const id = `quick-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <Reveal delay={delay} className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-lp-hairline px-3 pb-3">
        <h3 id={id} className="font-heading text-base font-semibold tracking-tight text-lp-ink">
          {title}
        </h3>
        <span className="text-xs text-lp-ink-soft">{note}</span>
      </div>
      <ul aria-labelledby={id} className="mt-2 flex flex-col">
        {links.map((link) => (
          <QuickRow key={link.href} link={link} />
        ))}
      </ul>
    </Reveal>
  );
}

/** Direct entry points: the first thing most visitors actually need. */
export function QuickAccess() {
  return (
    <section
      id="services"
      aria-labelledby="services-heading"
      className="scroll-mt-20 border-y border-lp-hairline bg-lp-surface"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20 lg:px-8">
        <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="services-heading"
            className="font-heading text-2xl font-bold tracking-tight text-lp-ink sm:text-3xl"
          >
            Quick access
          </h2>
          <p className="text-sm text-lp-ink-soft">
            Services marked <span className="font-semibold">Coming soon</span> are not available
            yet.
          </p>
        </div>
        <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
          <Column title="Students" note="Portal" links={STUDENT_LINKS} delay={0} />
          <Column title="Public verification" note="Planned" links={PUBLIC_SERVICES} delay={0.08} />
        </div>
      </div>
    </section>
  );
}
