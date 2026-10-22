'use client';

import { useEffect, useRef } from 'react';

/**
 * Calm ambient motion for the sign-in brand panel: the orbit rings turn very slowly and lean a
 * little toward a fine pointer. Driven by one requestAnimationFrame loop that writes CSS custom
 * properties — no animation library is loaded on the sign-in routes, and nothing here appears in
 * `document.getAnimations()`, so tests and assistive tooling see a settled page. Off for reduced
 * motion (and stopped at once if that preference changes), paused while the tab is hidden.
 */
export function AuthAmbient({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || preference.matches) return;
    let frame = 0;
    let last = performance.now();
    let angle = 0;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const tick = (now: number) => {
      const delta = Math.min(now - last, 64);
      last = now;
      angle = (angle + delta * 0.004) % 360;
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
      element.style.setProperty('--auth-spin', `${angle.toFixed(2)}deg`);
      element.style.setProperty('--auth-tilt-x', `${current.y.toFixed(2)}deg`);
      element.style.setProperty('--auth-tilt-y', `${current.x.toFixed(2)}deg`);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame || document.hidden || preference.matches) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const reset = () => {
      stop();
      for (const name of ['--auth-spin', '--auth-tilt-x', '--auth-tilt-y'])
        element.style.removeProperty(name);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.x = (event.clientX / window.innerWidth - 0.5) * 10;
      target.y = -(event.clientY / window.innerHeight - 0.5) * 8;
    };
    const onPreference = () => {
      if (preference.matches) reset();
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointermove', onPointer, { passive: true });
    preference.addEventListener('change', onPreference);
    return () => {
      reset();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      preference.removeEventListener('change', onPreference);
    };
  }, []);

  return (
    <div ref={ref} className={className} aria-hidden="true">
      {children}
    </div>
  );
}
