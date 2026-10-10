'use client';

import { motion, useReducedMotion } from 'motion/react';
import { CheckIcon } from 'lucide-react';
import { cn } from '@docversity/ui';
import { ROADMAP } from './content';
import { SectionHeading } from './primitives';

const EASE = [0.22, 1, 0.36, 1] as const;

export function Roadmap() {
  const reduce = useReducedMotion();
  return (
    <section
      id="roadmap"
      aria-labelledby="roadmap-heading"
      className="scroll-mt-20 border-t border-lp-hairline bg-lp-surface py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeading
          id="roadmap-heading"
          eyebrow="What’s coming"
          title={
            <>
              What’s live, and what’s <span className="lp-serif">planned</span>.
            </>
          }
          lead="Planned features have no release dates yet. They will appear here, and in your portal, when they are ready."
        />

        <ol className="relative mt-16 grid gap-10 lg:grid-cols-4 lg:gap-6">
          {/* Connector: solid under the live stage, dashed under planned ones (desktop). */}
          <span
            aria-hidden="true"
            className="absolute top-5 right-0 left-5 hidden border-t border-dashed border-lp-hairline-strong lg:block"
          />
          <motion.span
            aria-hidden="true"
            className="absolute top-5 left-5 hidden h-px w-1/4 origin-left bg-lp-accent lg:block"
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: EASE }}
          />
          {ROADMAP.map((stage, index) => {
            const live = stage.availability === 'live';
            return (
              <motion.li
                key={stage.title}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.15 + index * 0.12 }}
                className="relative flex gap-5 lg:flex-col"
              >
                <span
                  className={cn(
                    'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border',
                    live
                      ? 'border-lp-accent bg-lp-accent text-lp-cta-fg shadow-[0_0_0_6px_var(--lp-accent-tint)]'
                      : 'border-dashed border-lp-hairline-strong bg-lp-surface text-lp-ink-soft',
                  )}
                >
                  {live ? (
                    <CheckIcon aria-hidden="true" className="size-4" strokeWidth={3} />
                  ) : (
                    <span className="font-heading text-sm font-bold">
                      {String(index).padStart(2, '0')}
                    </span>
                  )}
                </span>
                <div className="flex flex-col gap-2 pt-1 lg:pt-0">
                  <span
                    className={cn('lp-type-eyebrow', live ? 'text-lp-live' : 'text-lp-ink-soft')}
                  >
                    {live ? 'Available now' : 'Planned'}
                  </span>
                  <h3 className="font-heading text-lg font-semibold tracking-tight text-lp-ink">
                    {stage.title}
                  </h3>
                  <p className="max-w-xs text-[0.9375rem] leading-relaxed text-lp-ink-soft">
                    {stage.description}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
