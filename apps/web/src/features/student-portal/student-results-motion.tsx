'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';

/** One visible-by-default entrance using the existing student dashboard lifecycle and ease. */
export function StudentResultsMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const root = scope.current;
    if (!root || reduce !== false) return;
    let cancelled = false;
    let revert: (() => void) | undefined;
    void import('gsap')
      .then(({ gsap }) => {
        if (cancelled) return;
        const context = gsap.context(() => {
          gsap.fromTo(root, { y: 4 }, { y: 0, duration: 0.28, ease: 'power3.out' });
        }, root);
        revert = () => {
          context.revert();
        };
      })
      .catch(() => {
        /* Optional motion never blocks the results page. */
      });
    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduce]);
  return <div ref={scope}>{children}</div>;
}
