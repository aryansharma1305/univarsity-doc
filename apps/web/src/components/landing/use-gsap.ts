'use client';

import { useEffect, type RefObject } from 'react';
import type { gsap as GsapInstance } from 'gsap';
import type { ScrollTrigger as ScrollTriggerClass } from 'gsap/ScrollTrigger';

type Gsap = typeof GsapInstance;
type ScrollTriggerType = typeof ScrollTriggerClass;

let loader: Promise<{ gsap: Gsap; ScrollTrigger: ScrollTriggerType }> | undefined;

/** GSAP is only loaded on the landing page, on demand (docs/architecture/frontend-animation.md). */
function loadGsap() {
  loader ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
    ([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    },
  );
  return loader;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs a GSAP setup scoped to `scope` once GSAP has loaded; everything it creates is reverted on
 * unmount. Skipped entirely for reduced-motion users — the static layout is the complete design.
 */
export function useGsapScene(
  scope: RefObject<HTMLElement | null>,
  setup: (gsap: Gsap, ScrollTrigger: ScrollTriggerType, root: HTMLElement) => void,
) {
  useEffect(() => {
    const root = scope.current;
    if (!root || prefersReducedMotion()) return;
    let cancelled = false;
    let revert: (() => void) | undefined;
    void loadGsap().then(({ gsap, ScrollTrigger }) => {
      if (cancelled) return;
      const ctx = gsap.context(() => {
        setup(gsap, ScrollTrigger, root);
      }, root);
      revert = () => {
        ctx.revert();
      };
    });
    return () => {
      cancelled = true;
      revert?.();
    };
    // The setup is static per component; re-running it on every render would restart the timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
