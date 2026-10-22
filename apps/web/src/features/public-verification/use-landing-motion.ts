'use client';

import { type RefObject, useEffect, useLayoutEffect } from 'react';

import { MOTION_FLAG } from './motion-guard';

function releaseGuard() {
  Reflect.set(window, '__dvMotionReady', true);
  document.body.removeAttribute(MOTION_FLAG);
}

/**
 * UI-06 homepage scenes (docs/architecture/frontend-animation.md: GSAP for the public landing hero
 * and its scroll sequences only). GSAP + ScrollTrigger are loaded on demand by this route alone.
 * Everything is optional: content is complete and readable before, without and after it runs, every
 * tween starts from an already-laid-out element (no layout shift), and a switch to reduced motion
 * reverts every tween, ScrollTrigger and loop immediately.
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

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled || preference.matches) {
          releaseGuard();
          return;
        }
        gsap.registerPlugin(ScrollTrigger);
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

          /* 3 — Depth: crest tilts toward a fine pointer and drifts slower than the page. */
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
          gsap.to(q('[data-crest-parallax]'), {
            yPercent: 18,
            ease: 'none',
            scrollTrigger: {
              trigger: q('[data-hero]')[0],
              start: 'top top',
              end: 'bottom top',
              scrub: true,
            },
          });
          gsap.to(q('[data-hero-depth]'), {
            yPercent: -12,
            opacity: 0.35,
            ease: 'none',
            scrollTrigger: {
              trigger: q('[data-hero]')[0],
              start: 'top top',
              end: 'bottom top',
              scrub: true,
            },
          });

          /* 4 — Scroll reveals: opacity/transform only, never visibility, so content stays reachable. */
          const viewport = window.innerHeight;
          for (const item of q('[data-reveal]')) {
            if (item.getBoundingClientRect().top < viewport * 0.92) continue;
            gsap.fromTo(
              item,
              { opacity: 0, y: 36, filter: 'blur(6px)' },
              {
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                duration: 1,
                ease: 'expo.out',
                clearProps: 'opacity,transform,filter',
                scrollTrigger: { trigger: item, start: 'top 88%', once: true },
              },
            );
          }

          /* 5 — How it works: the rail fills with scroll and each step lights up as it is reached. */
          const rail = q('[data-rail-fill]')[0];
          const steps = q('[data-step]');
          if (rail && steps.length > 0) {
            const vertical = window.matchMedia('(max-width: 899px)').matches;
            gsap.fromTo(
              rail,
              { [vertical ? 'scaleY' : 'scaleX']: 0 },
              {
                [vertical ? 'scaleY' : 'scaleX']: 1,
                ease: 'none',
                scrollTrigger: {
                  trigger: q('[data-steps]')[0],
                  start: vertical ? 'top 70%' : 'top 75%',
                  end: vertical ? 'bottom 60%' : 'center 45%',
                  scrub: 0.6,
                },
              },
            );
            steps.forEach((step) => {
              step.setAttribute('data-lit', 'false');
              ScrollTrigger.create({
                trigger: step,
                start: vertical ? 'top 65%' : 'top 70%',
                onEnter: () => {
                  step.setAttribute('data-lit', 'true');
                },
                onLeaveBack: () => {
                  step.setAttribute('data-lit', 'false');
                },
              });
            });
            cleanups.push(() => {
              for (const step of steps) step.removeAttribute('data-lit');
            });
          }

          /* 6 — Safeguards: the shield outline draws itself, then a scan line sweeps it slowly. */
          const shield = q('[data-shield]')[0];
          if (shield) {
            gsap.fromTo(
              q('[data-shield-draw]'),
              { strokeDashoffset: 1 },
              {
                strokeDashoffset: 0,
                duration: 1.8,
                stagger: 0.15,
                ease: 'power2.inOut',
                scrollTrigger: { trigger: shield, start: 'top 80%', once: true },
              },
            );
            gsap.fromTo(
              q('[data-shield-scan]'),
              { y: -150 },
              { y: 150, duration: 3.6, ease: 'sine.inOut', yoyo: true, repeat: -1 },
            );
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
