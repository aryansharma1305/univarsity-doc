'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@docversity/ui';
import type { Availability } from './content';

export function Eyebrow({
  children,
  className,
  tone = 'accent',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'accent' | 'inverted';
}) {
  return (
    <p
      className={cn(
        'lp-type-eyebrow flex items-center gap-2',
        tone === 'accent' ? 'text-lp-accent' : 'text-white/70',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-px w-6', tone === 'accent' ? 'bg-lp-accent' : 'bg-white/40')}
      />
      {children}
    </p>
  );
}

export function AvailabilityBadge({
  availability,
  className,
}: {
  availability: Availability;
  className?: string;
}) {
  return availability === 'live' ? (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-success-text',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
      Available
    </span>
  ) : (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-lp-hairline-strong bg-lp-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-lp-ink-soft',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full border border-current" />
      Coming soon
    </span>
  );
}

const CTA_STYLES = {
  primary:
    'bg-lp-cta text-lp-cta-fg shadow-[0_1px_0_0_rgb(255_255_255/0.12)_inset,0_8px_20px_-8px_rgb(3_20_47/0.6)] hover:bg-lp-cta-hover',
  accent: 'bg-lp-accent text-white hover:bg-brand-hover',
  secondary: 'border border-lp-hairline-strong bg-lp-surface text-lp-ink hover:border-lp-ink/30',
  inverted: 'bg-white text-lp-ink hover:bg-white/90',
  ghostInverted: 'border border-white/20 text-white hover:border-white/40 hover:bg-white/5',
} as const;

/** Pill CTA with a sliding arrow. Renders a Next link for routes and a plain anchor for #hashes. */
export function CtaLink({
  href,
  children,
  variant = 'primary',
  arrow = true,
  className,
}: {
  href: Route | `#${string}`;
  children: ReactNode;
  variant?: keyof typeof CTA_STYLES;
  arrow?: boolean;
  className?: string;
}) {
  const classes = cn(
    'group inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold tracking-tight transition-[background-color,border-color,transform] duration-200 active:scale-[0.98]',
    CTA_STYLES[variant],
    className,
  );
  const content = (
    <>
      {children}
      {arrow && (
        <ArrowRightIcon
          aria-hidden="true"
          className="size-4 transition-transform duration-200 ease-lp-out group-hover:translate-x-0.5"
        />
      )}
    </>
  );
  return href.startsWith('#') ? (
    <a href={href} className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

/** Scroll-into-view reveal (Framer Motion). Static for reduced-motion users. */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 16,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = 'left',
  tone = 'light',
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'left' | 'center';
  tone?: 'light' | 'dark';
}) {
  return (
    <Reveal
      className={cn(
        'flex max-w-3xl flex-col gap-5',
        align === 'center' && 'mx-auto items-center text-center',
      )}
    >
      <Eyebrow tone={tone === 'light' ? 'accent' : 'inverted'}>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className={cn('lp-type-section', tone === 'light' ? 'text-lp-ink' : 'text-white')}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            'lp-type-lead max-w-2xl',
            tone === 'light' ? 'text-lp-ink-soft' : 'text-white/70',
          )}
        >
          {lead}
        </p>
      )}
    </Reveal>
  );
}
