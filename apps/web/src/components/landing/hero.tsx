'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@docversity/ui';
import { Magnetic } from './interactions';
import { CtaLink } from './primitives';
import {
  FloatCard,
  PORTAL_VIEWS,
  type PortalView,
  StudentPhone,
  StudentWindow,
} from './product-mockups';
import { useGsapScene } from './use-gsap';

/** Screen-reader description of each preview screen (the drawing itself is decorative). */
const VIEW_DESCRIPTIONS: Record<PortalView, string> = {
  dashboard:
    'The dashboard: a student overview, profile details, registrations, documents and examinations.',
  profile: 'My Profile: your personal details and photo, with a button to request a correction.',
  course: 'Course Details: your program and the subjects in each semester of your curriculum.',
  examinations:
    'Examinations: links to the university’s examination app, re-exam applications, and results marked as coming soon.',
  documents: 'My Documents: certificates and marksheets published to you, ready to download.',
};

/** Each word sits in its own clipping box so the GSAP intro can slide it up from below. */
function Word({ children, className }: { children: string; className?: string }) {
  return (
    <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
      <span data-lp-word className={`inline-block ${className ?? ''}`}>
        {children}
      </span>
    </span>
  );
}

export function Hero() {
  const scope = useRef<HTMLElement>(null);
  const [view, setView] = useState<PortalView>('dashboard');
  const tabsId = useId();

  useGsapScene(scope, (gsap, _ScrollTrigger, root) => {
    const q = gsap.utils.selector(root);
    const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
    intro
      .from(q('[data-lp-eyebrow]'), { y: 12, autoAlpha: 0, duration: 0.8 })
      .from(q('[data-lp-word]'), { yPercent: 115, duration: 1.1, stagger: 0.07 }, '<0.05')
      .from(q('[data-lp-fade]'), { y: 16, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, '<0.35')
      .from(
        q('[data-lp-window]'),
        {
          y: 90,
          rotateX: 22,
          scale: 0.94,
          autoAlpha: 0,
          duration: 1.6,
          transformOrigin: '50% 0%',
        },
        '<0.1',
      )
      .from(
        q('[data-lp-part="nav-item"]'),
        { x: -10, autoAlpha: 0, duration: 0.6, stagger: 0.035 },
        '<0.45',
      )
      .from(
        q('[data-lp-part="panel"]'),
        { y: 14, autoAlpha: 0, duration: 0.7, stagger: 0.06 },
        '<0.1',
      )
      .from(q('[data-lp-tabs]'), { y: 10, autoAlpha: 0, duration: 0.8 }, '<0.2')
      .from(
        q('[data-lp-float]'),
        { y: 40, autoAlpha: 0, scale: 0.96, duration: 1.1, stagger: 0.12 },
        '<0.1',
      );
    // Everything has its starting state now — lift the pre-paint guard.
    gsap.set(q('[data-lp-reveal]'), { visibility: 'visible' });
    (window as { __lpReady?: boolean }).__lpReady = true;

    // Depth on scroll: floating cards drift at different speeds over the window.
    const stage = q('[data-lp-stage]')[0];
    const drift = [
      ['[data-lp-float="right"]', -120],
      ['[data-lp-float="phone"]', -180],
    ] as const;
    for (const [selector, distance] of drift) {
      gsap.to(q(selector), {
        y: distance,
        ease: 'none',
        scrollTrigger: { trigger: stage, start: 'top 75%', end: 'bottom top', scrub: 0.6 },
      });
    }
    // The window leans back slightly as it scrolls away (separate element from the intro tween).
    gsap.to(q('[data-lp-tilt]'), {
      rotateX: 9,
      scale: 0.97,
      transformOrigin: '50% 100%',
      ease: 'none',
      scrollTrigger: { trigger: stage, start: 'center center', end: 'bottom top', scrub: 0.8 },
    });
  });

  return (
    <section
      ref={scope}
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-lp-paper"
    >
      <div aria-hidden="true" className="lp-grid lp-grid-fade absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(7_89_215/0.09),transparent)]"
      />

      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 pt-14 text-center sm:pt-20 lg:px-8 lg:pt-24">
        <p
          data-lp-eyebrow
          data-lp-reveal
          className="inline-flex items-center gap-2 rounded-full border border-lp-hairline-strong bg-lp-surface py-1 pr-3 pl-3 text-[0.8125rem] sm:pl-1 font-medium text-lp-ink-soft shadow-card"
        >
          <span className="hidden rounded-full bg-lp-accent-tint px-2 py-0.5 text-[0.6875rem] font-semibold text-lp-accent sm:inline">
            Docversity
          </span>
          Student portal
        </p>

        <h1
          id="hero-heading"
          data-lp-reveal
          className="lp-type-hero mt-7 max-w-5xl text-balance text-lp-ink"
        >
          <span className="block">
            <Word>Everything</Word> <Word>academic.</Word>
          </span>
          <span className="block">
            <Word>One</Word>{' '}
            <Word className="lp-serif pr-[0.06em] text-lp-accent">intelligent</Word>{' '}
            <Word>workspace.</Word>
          </span>
        </h1>

        <p
          data-lp-fade
          data-lp-reveal
          className="lp-type-lead mt-6 max-w-2xl text-pretty text-lp-ink-soft"
        >
          Your profile, course, documents and examinations in one student portal, on your phone or
          laptop.
        </p>

        <div
          data-lp-fade
          data-lp-reveal
          className="mt-9 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center"
        >
          <Magnetic className="flex">
            <CtaLink href="/student/login" className="w-full">
              Student Sign In
            </CtaLink>
          </Magnetic>
          <CtaLink href="/student/register" variant="secondary" arrow={false}>
            Activate your account
          </CtaLink>
        </div>

        <p data-lp-fade data-lp-reveal className="mt-5 text-sm text-lp-ink-soft">
          First time here? You’ll need the activation code from your university.{' '}
          <a
            href="#get-started"
            className="rounded font-semibold whitespace-nowrap text-lp-accent underline-offset-4 hover:underline"
          >
            How it works
          </a>
        </p>
      </div>

      {/* Product showcase */}
      <div
        data-lp-stage
        className="relative mx-auto mt-14 max-w-7xl px-4 pb-20 [perspective:1600px] sm:mt-20 sm:pb-28 lg:px-8"
      >
        <div
          data-lp-tabs
          data-lp-reveal
          className="relative z-10 mb-5 flex flex-col items-center gap-3"
        >
          <p className="text-xs font-medium text-lp-ink-soft">
            Click through a preview of the student portal
          </p>
          <div
            role="tablist"
            aria-label="Student portal preview"
            className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-lp-hairline-strong bg-lp-surface p-1 shadow-card [scrollbar-width:none]"
          >
            {PORTAL_VIEWS.map((item, index) => {
              const selected = item.id === view;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`${tabsId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setView(item.id);
                  }}
                  onKeyDown={(event) => {
                    const step =
                      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                    if (!step) return;
                    event.preventDefault();
                    const next =
                      PORTAL_VIEWS[(index + step + PORTAL_VIEWS.length) % PORTAL_VIEWS.length];
                    if (!next) return;
                    setView(next.id);
                    document.getElementById(`${tabsId}-${next.id}`)?.focus();
                  }}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
                    selected ? 'bg-lp-cta text-lp-cta-fg' : 'text-lp-ink-soft hover:text-lp-ink',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          data-lp-window
          data-lp-reveal
          className="relative mx-auto max-w-[22rem] md:max-w-[1040px]"
        >
          <div
            data-lp-tilt
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-${view}`}
          >
            <p className="sr-only">{VIEW_DESCRIPTIONS[view]}</p>
            <StudentWindow view={view} onSelect={setView} />
          </div>
        </div>

        <div
          data-lp-float="right"
          data-lp-reveal
          className="absolute top-20 right-4 hidden lg:block xl:right-10"
        >
          <FloatCard
            label="Re-exam application"
            title="Application submitted"
            status="Under review"
            tone="info"
          />
        </div>

        <div
          data-lp-float="phone"
          data-lp-reveal
          className="absolute -bottom-24 left-6 hidden xl:left-14 xl:block"
        >
          <StudentPhone className="w-56 -rotate-[4deg]" />
        </div>
      </div>
    </section>
  );
}
