'use client';

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { cn } from '@docversity/ui';
import { FAQS } from './content';
import { Reveal, SectionHeading } from './primitives';

/** Deep link to one answer, e.g. `/#faq-1` (used by the command palette). */
export function faqHash(index: number): `#faq-${string}` {
  return `#faq-${String(index)}`;
}

function matches(query: string, text: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const [query, setQuery] = useState('');
  const reduce = useReducedMotion();
  const baseId = useId();

  // Open the answer named in the URL hash, on load and whenever the hash changes.
  useEffect(() => {
    const openFromHash = () => {
      const match = /^#faq-(\d+)$/.exec(window.location.hash);
      if (!match) return;
      const index = Number(match[1]);
      if (FAQS[index]) {
        setQuery('');
        setOpen(index);
      }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => {
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);

  const results = FAQS.map((faq, index) => ({ faq, index })).filter(
    ({ faq }) => !query || matches(query, faq.question) || matches(query, faq.answer),
  );

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 border-t border-lp-hairline bg-lp-surface py-24 sm:py-32"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-4 lg:grid-cols-[1fr_1.4fr] lg:gap-20 lg:px-8">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeading
            id="faq-heading"
            eyebrow="Questions"
            title={
              <>
                Questions students <span className="lp-serif">ask</span>.
              </>
            }
            lead={
              <>
                Can’t find your answer? Visit{' '}
                <Link
                  href="/help"
                  className="rounded font-semibold text-lp-accent underline-offset-4 hover:underline"
                >
                  Help
                </Link>{' '}
                or contact the registrar’s office.
              </>
            }
          />
        </div>

        <Reveal delay={0.05}>
          <label className="relative mb-6 block">
            <span className="sr-only">Search questions</span>
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-lp-ink-soft"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search, e.g. password or re-exam"
              className="h-12 w-full rounded-full border border-lp-hairline-strong bg-lp-paper pr-4 pl-11 text-[0.9375rem] text-lp-ink placeholder:text-lp-ink-soft focus-visible:border-lp-accent"
            />
          </label>
          <p aria-live="polite" className="sr-only">
            {query ? `${String(results.length)} matching questions` : ''}
          </p>
          <ul className="divide-y divide-lp-hairline border-y border-lp-hairline">
            <AnimatePresence initial={false}>
              {results.map(({ faq, index }) => {
                const expanded = open === index;
                const panelId = `${baseId}-panel-${String(index)}`;
                const buttonId = `${baseId}-button-${String(index)}`;
                return (
                  <motion.li
                    key={faq.question}
                    id={`faq-${String(index)}`}
                    className="scroll-mt-28"
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
                  >
                    <h3>
                      <button
                        type="button"
                        id={buttonId}
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => {
                          setOpen(expanded ? null : index);
                        }}
                        className="group flex w-full items-center justify-between gap-6 py-5 text-left"
                      >
                        <span className="font-heading text-[1.0625rem] font-semibold tracking-tight text-lp-ink transition-colors group-hover:text-lp-accent">
                          {faq.question}
                        </span>
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full border border-lp-hairline-strong text-lp-ink transition-[transform,background-color,color,border-color] duration-300',
                            expanded && 'rotate-45 border-lp-cta bg-lp-cta text-lp-cta-fg',
                          )}
                        >
                          <PlusIcon aria-hidden="true" className="size-4" />
                        </span>
                      </button>
                    </h3>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          id={panelId}
                          role="region"
                          aria-labelledby={buttonId}
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={
                            reduce
                              ? { opacity: 0, transition: { duration: 0 } }
                              : { height: 0, opacity: 0 }
                          }
                          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="max-w-xl pr-14 pb-6 text-[0.9375rem] leading-relaxed text-lp-ink-soft">
                            {faq.answer}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
          {results.length === 0 && (
            <p className="py-8 text-[0.9375rem] text-lp-ink-soft">
              No questions match “{query}”. Try another word, or visit{' '}
              <Link
                href="/help"
                className="rounded font-semibold text-lp-accent underline-offset-4 hover:underline"
              >
                Help
              </Link>
              .
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
