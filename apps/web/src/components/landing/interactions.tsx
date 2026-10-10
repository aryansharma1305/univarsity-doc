'use client';

import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@docversity/ui';

/** Pointer handler for cards with an `lp-spotlight` layer: tracks the cursor in CSS variables. */
export function trackSpotlight(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--lp-x', `${String(event.clientX - rect.left)}px`);
  event.currentTarget.style.setProperty('--lp-y', `${String(event.clientY - rect.top)}px`);
}

/** Soft glow that follows the cursor. Place inside a `relative group` card. */
export function SpotlightLayer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'lp-spotlight pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100',
        className,
      )}
    />
  );
}

/**
 * Pulls its child slightly toward the cursor (Framer Motion springs). Mouse only — touch and
 * reduced-motion users get a static element.
 */
export function Magnetic({
  children,
  strength = 0.25,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn('inline-flex', className)}
      style={{ x: springX, y: springY }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * strength);
        y.set((event.clientY - rect.top - rect.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
