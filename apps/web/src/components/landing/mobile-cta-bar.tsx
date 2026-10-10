'use client';

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/** Selectors for the regions that already show sign-in buttons; the bar hides while any is visible. */
const HIDE_WHEN_VISIBLE = [
  '[aria-labelledby="hero-heading"]',
  '[aria-labelledby="cta-heading"]',
  'footer',
] as const;

/** Phone-only bar with the two student actions, shown between the hero and the final chooser. */
export function MobileCtaBar() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const targets = HIDE_WHEN_VISIBLE.map((selector) => document.querySelector(selector)).filter(
      (el): el is Element => el !== null,
    );
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      setShow(visible.size === 0);
    });
    for (const target of targets) observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { y: '110%' }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: '110%' }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-lp-hairline bg-lp-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(3_20_47/0.25)] backdrop-blur-md md:hidden"
        >
          <nav aria-label="Student quick actions" className="flex gap-2">
            <Link
              href="/student/register"
              className="flex h-11 flex-1 items-center justify-center rounded-full border border-lp-hairline-strong text-sm font-semibold text-lp-ink"
            >
              Activate
            </Link>
            <Link
              href="/student/login"
              className="flex h-11 flex-1 items-center justify-center rounded-full bg-lp-cta text-sm font-semibold text-lp-cta-fg"
            >
              Sign in
            </Link>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
