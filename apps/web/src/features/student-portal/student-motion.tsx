'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** Same scoped, optional GSAP lifecycle as UI-02; student records are visible by default. */
export function StudentDashboardMotion({ children }: { children: ReactNode }) {
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
          gsap
            .timeline({ defaults: { duration: 0.28, ease: 'power3.out' } })
            .fromTo('[data-student-welcome]', { y: 2 }, { y: 0 }, 0)
            .fromTo('[data-student-identity]', { y: 6, opacity: 0.85 }, { y: 0, opacity: 1 }, 0.04)
            .fromTo('[data-student-academic]', { y: 4 }, { y: 0, stagger: 0.035 }, 0.08)
            .fromTo('[data-student-actions]', { y: 4 }, { y: 0 }, 0.12);
        }, root);
        revert = () => {
          context.revert();
        };
      })
      .catch(() => {
        /* Records and navigation remain usable without optional motion. */
      });
    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduce]);
  return (
    <div ref={scope} className="flex flex-col gap-6 sm:gap-8">
      {children}
    </div>
  );
}

export function StudentActionMotion({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.15 }}
      className="min-w-0"
    >
      {children}
    </motion.div>
  );
}
