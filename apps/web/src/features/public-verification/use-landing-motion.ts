'use client';

import { type RefObject, useEffect, useLayoutEffect } from 'react';

import { MOTION_FLAG } from './motion-guard';

function releaseGuard() {
  Reflect.set(window, '__dvMotionReady', true);
  document.body.removeAttribute(MOTION_FLAG);
}

/**
 * UI-06 homepage scenes (docs/architecture/frontend-animation.md: GSAP for the public landing hero
 * only). GSAP is loaded on demand by this route alone.
 * Everything is optional: content is complete and readable before, without and after it runs, every
 * tween starts from an already-laid-out element (no layout shift), and a switch to reduced motion
 * reverts every tween and loop immediately.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  // Client-side navigation back to `/` never runs the server page's inline guard, so the headline
  // words would paint in place and jump when GSAP starts. Apply the same guard before paint here;
  // it is lifted when the scene starts, on reduced motion, on unmount, or after 2.5 s at the latest.
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.body.setAttribute(MOTION_FLAG, '');
    const timeout = window.setTimeout(() => {
      document.body.removeAttribute(MOTION_FLAG);
    }, 2500);
    return () => {
      window.clearTimeout(timeout);
      document.body.removeAttribute(MOTION_FLAG);
    };
  }, []);

  useEffect(() => {
    const element = root.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || preference.matches) {
      releaseGuard();
      return;
    }
    let cancelled = false;
    let revert: (() => void) | undefined;
    const stop = () => {
      if (!preference.matches) return;
      cancelled = true;
      revert?.();
      revert = undefined;
      releaseGuard();
    };
    preference.addEventListener('change', stop);

    void import('gsap')
      .then(({ gsap }) => {
        if (cancelled || preference.matches) {
          releaseGuard();
          return;
        }
        const cleanups: (() => void)[] = [];
        const context = gsap.context(() => {
          const q = gsap.utils.selector(element);

          /* 1 — Hero entrance: masked headline, then copy, actions and the crest stage. */
          const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
          intro
            .fromTo(
              q('[data-ui04-intro]'),
              { y: 10 },
              { y: 0, duration: 0.9, stagger: 0.08, clearProps: 'transform' },
              0,
            )
            .fromTo(
              q('[data-hero-word]'),
              { yPercent: 108, rotate: 4 },
              { yPercent: 0, rotate: 0, duration: 1.05, stagger: 0.09, clearProps: 'transform' },
              0.05,
            )
            .fromTo(
              q('[data-hero-fade]'),
              { opacity: 0, y: 14 },
              { opacity: 1, y: 0, duration: 0.8, stagger: 0.07, clearProps: 'opacity,transform' },
              0.35,
            )
            .fromTo(
              q('[data-crest]'),
              { scale: 0.9, opacity: 0, filter: 'blur(10px)' },
              { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.3, clearProps: 'all' },
              0.1,
            )
            .fromTo(
              q('[data-orbit-draw]'),
              { strokeDashoffset: 1 },
              { strokeDashoffset: 0, duration: 1.6, stagger: 0.12, ease: 'power3.inOut' },
              0.2,
            );
          releaseGuard();

          /* 2 — Living crest: slow counter-rotating orbits and a gently breathing halo. */
          gsap.to(q('[data-orbit="cw"]'), {
            rotation: 360,
            duration: 90,
            ease: 'none',
            repeat: -1,
            svgOrigin: '250 250',
          });
          gsap.to(q('[data-orbit="ccw"]'), {
            rotation: -360,
            duration: 140,
            ease: 'none',
            repeat: -1,
            svgOrigin: '250 250',
          });
          gsap.to(q('[data-halo]'), {
            scale: 1.06,
            opacity: 0.85,
            duration: 4.5,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          });

          /* 3 — Depth: crest tilts toward a fine pointer. */
          const tilt = q('[data-crest-tilt]')[0];
          if (tilt && window.matchMedia('(pointer: fine)').matches) {
            const rotateX = gsap.quickTo(tilt, 'rotationX', { duration: 0.8, ease: 'power3.out' });
            const rotateY = gsap.quickTo(tilt, 'rotationY', { duration: 0.8, ease: 'power3.out' });
            const hero = q('[data-hero]')[0] ?? element;
            const onMove = (event: PointerEvent) => {
              const box = hero.getBoundingClientRect();
              rotateY(((event.clientX - box.left) / box.width - 0.5) * 14);
              rotateX(-((event.clientY - box.top) / box.height - 0.5) * 10);
            };
            const onLeave = () => {
              rotateX(0);
              rotateY(0);
            };
            hero.addEventListener('pointermove', onMove);
            hero.addEventListener('pointerleave', onLeave);
            cleanups.push(() => {
              hero.removeEventListener('pointermove', onMove);
              hero.removeEventListener('pointerleave', onLeave);
            });
          }
        }, element);
        revert = () => {
          for (const cleanup of cleanups) cleanup();
          context.revert();
        };
      })
      .catch(() => {
        // Optional motion must never prevent the complete static page from being used.
        releaseGuard();
      });

    return () => {
      cancelled = true;
      revert?.();
      preference.removeEventListener('change', stop);
    };
  }, [root]);
}
