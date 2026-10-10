'use client';

import { useRef } from 'react';
import { HashIcon, KeyRoundIcon, LockKeyholeIcon } from 'lucide-react';
import { STEPS } from './content';
import { CtaLink, Reveal, SectionHeading } from './primitives';
import { useGsapScene } from './use-gsap';

const READY_ITEMS = [
  {
    label: 'Your registration number',
    hint: 'The one your activation code was issued for.',
    icon: HashIcon,
  },
  {
    label: 'Your activation code',
    hint: 'Issued by your university. It works once.',
    icon: KeyRoundIcon,
  },
  {
    label: 'A new password',
    hint: 'You choose it during activation.',
    icon: LockKeyholeIcon,
  },
] as const;

export function HowItWorks() {
  const scope = useRef<HTMLElement>(null);

  // The rail fills as the reader scrolls; each step lights up when the fill reaches it.
  useGsapScene(scope, (gsap, ScrollTrigger, root) => {
    const q = gsap.utils.selector(root);
    const list = q('[data-lp-steps]')[0];
    gsap.fromTo(
      q('[data-lp-rail-fill]'),
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: { trigger: list, start: 'top 65%', end: 'bottom 55%', scrub: 0.4 },
      },
    );
    for (const step of q('[data-lp-step]')) {
      gsap.set(step, { attr: { 'data-state': 'idle' } });
      ScrollTrigger.create({
        trigger: step,
        start: 'top 62%',
        onEnter: () => {
          step.setAttribute('data-state', 'active');
        },
        onLeaveBack: () => {
          step.setAttribute('data-state', 'idle');
        },
      });
    }
  });

  return (
    <section
      ref={scope}
      id="get-started"
      aria-labelledby="how-heading"
      className="scroll-mt-20 bg-lp-paper py-24 sm:py-32"
    >
      <div className="mx-auto grid max-w-7xl gap-14 px-4 lg:grid-cols-[1fr_1.15fr] lg:gap-20 lg:px-8">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeading
            id="how-heading"
            eyebrow="Get started"
            title={
              <>
                Activate <span className="lp-serif">once</span>, then sign in.
              </>
            }
            lead="Your university has already registered you. Activate your account once, then sign in with your registration number and password."
          />
          <Reveal delay={0.1} className="mt-8">
            <div className="rounded-2xl border border-lp-hairline bg-lp-surface p-5">
              <p className="font-heading text-sm font-semibold text-lp-ink">
                Have these ready before you activate
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {READY_ITEMS.map((item) => (
                  <li key={item.label} className="flex items-start gap-3 text-sm">
                    <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-lg bg-lp-accent-tint text-lp-accent">
                      <item.icon aria-hidden="true" className="size-3.5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-lp-ink">{item.label}</span>
                      <span className="text-lp-ink-soft">{item.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <CtaLink href="/student/register" className="mt-6">
              Activate your account
            </CtaLink>
          </Reveal>
        </div>

        <ol data-lp-steps className="relative flex flex-col">
          {/* Rail */}
          <span
            aria-hidden="true"
            className="absolute top-3 bottom-3 left-[1.1875rem] w-px bg-lp-hairline-strong"
          />
          <span
            aria-hidden="true"
            data-lp-rail-fill
            className="absolute top-3 bottom-3 left-[1.1875rem] w-px origin-top bg-lp-accent"
          />
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              data-lp-step
              data-state="active"
              className="group relative flex gap-6 pb-12 last:pb-0"
            >
              <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-lp-hairline-strong bg-lp-surface font-heading text-sm font-bold text-lp-ink-soft transition-[background-color,border-color,color,box-shadow] duration-500 group-data-[state=active]:border-lp-accent group-data-[state=active]:bg-lp-accent group-data-[state=active]:text-lp-cta-fg group-data-[state=active]:shadow-[0_0_0_6px_var(--lp-accent-tint)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="flex flex-col gap-2 pt-1.5 transition-opacity duration-500 group-data-[state=idle]:opacity-45">
                <h3 className="font-heading text-xl font-semibold tracking-tight text-lp-ink">
                  {step.title}
                </h3>
                <p className="max-w-md text-[0.9375rem] leading-relaxed text-lp-ink-soft">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
