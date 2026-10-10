'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Backstop for reduced motion: Framer Motion skips transform and layout animations for users who
 * prefer reduced motion, even where a component forgets its own check. GSAP scenes are skipped
 * separately in useGsapScene, and CSS transitions by the global rule in the theme.
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
