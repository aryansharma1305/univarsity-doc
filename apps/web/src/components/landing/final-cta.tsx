'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRightIcon, KeyRoundIcon, type LucideIcon, SparklesIcon } from 'lucide-react';
import { SpotlightLayer, trackSpotlight } from './interactions';
import { Reveal } from './primitives';

const CHOICES: readonly {
  href: Route;
  answer: string;
  action: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    href: '/student/login',
    answer: 'Yes, I have',
    action: 'Sign in',
    detail: 'Use your registration number and password.',
    icon: KeyRoundIcon,
  },
  {
    href: '/student/register',
    answer: 'No, this is my first time',
    action: 'Activate your account',
    detail: 'You need the activation code from your university.',
    icon: SparklesIcon,
  },
];

/** Sends students to the right door: first-timers often press "Login" by mistake. */
export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="relative isolate overflow-hidden border-t border-lp-hairline bg-lp-paper"
    >
      <div aria-hidden="true" className="lp-grid lp-grid-fade absolute inset-0 -z-10" />
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center sm:py-32 lg:px-8">
        <Reveal className="flex flex-col items-center gap-5">
          <h2 id="cta-heading" className="lp-type-section text-balance text-lp-ink">
            Have you signed in <span className="lp-serif text-lp-accent">before</span>?
          </h2>
          <p className="lp-type-lead max-w-xl text-lp-ink-soft">
            Pick one and we’ll take you to the right page.
          </p>
        </Reveal>
        <ul className="mt-10 grid w-full gap-4 text-left sm:grid-cols-2">
          {CHOICES.map((choice, index) => (
            <li key={choice.href}>
              <Reveal delay={0.08 * index} className="h-full">
                <Link
                  href={choice.href}
                  onPointerMove={trackSpotlight}
                  className="group relative flex h-full flex-col gap-5 overflow-hidden rounded-2xl border border-lp-hairline-strong bg-lp-surface p-6 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-lp-accent/40 hover:shadow-lp-float"
                >
                  <SpotlightLayer />
                  <span className="relative flex size-11 items-center justify-center rounded-xl bg-lp-accent-tint text-lp-accent">
                    <choice.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="relative flex flex-col gap-1">
                    <span className="text-sm font-medium text-lp-ink-soft">{choice.answer}</span>
                    <span className="font-heading text-2xl font-bold tracking-tight text-lp-ink">
                      {choice.action}
                    </span>
                    <span className="text-sm text-lp-ink-soft">{choice.detail}</span>
                  </span>
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="relative mt-auto size-5 text-lp-accent transition-transform duration-300 group-hover:translate-x-1"
                  />
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
