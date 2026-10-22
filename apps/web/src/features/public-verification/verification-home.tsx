'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { VerificationPanel } from './verification-panel';
import crest from './university-crest.png';
import styles from './verification-home.module.css';

export function VerificationHome({ year }: { year: number }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || preference.matches) return;
    let cancelled = false;
    let revert: (() => void) | undefined;
    const stop = () => {
      if (preference.matches) revert?.();
    };
    preference.addEventListener('change', stop);
    void import('gsap')
      .then(({ gsap }) => {
        if (cancelled || preference.matches) return;
        const context = gsap.context(() => {
          gsap.fromTo(
            '[data-ui04-intro]',
            { y: 6 },
            { y: 0, duration: 0.4, stagger: 0.06, ease: 'expo.out', clearProps: 'transform' },
          );
        }, element);
        revert = () => {
          context.revert();
        };
      })
      .catch(() => {
        // Optional motion must never prevent the complete static page from being used.
      });
    return () => {
      cancelled = true;
      revert?.();
      preference.removeEventListener('change', stop);
    };
  }, []);

  return (
    <div ref={root} className={styles.page}>
      <a href="#services" className={styles.skip}>
        Skip to verification services
      </a>
      <main id="main" tabIndex={-1} className={styles.wrap}>
        <section className={styles.hero} aria-labelledby="verification-title">
          <div data-ui04-intro className={styles.intro}>
            <h1 id="verification-title">
              Verify.
              <br />
              <em>Trust.</em> Confirm.
            </h1>
            <p className={styles.subtitle}>
              Academic credential verification, designed around one simple experience.
            </p>
          </div>
          <div data-ui04-intro className={styles.logoStage}>
            <div className={styles.rings} aria-hidden="true" />
            <div className={styles.corners} aria-hidden="true" />
            <Image
              src={crest}
              alt="Docversity University"
              priority
              sizes="(max-width: 560px) 210px, (max-width: 900px) 300px, 376px"
              className={styles.crest}
            />
          </div>
        </section>

        <section
          id="services"
          aria-label="Verification services"
          tabIndex={-1}
          className={styles.services}
        >
          <VerificationPanel />
        </section>
      </main>
      <footer className={`${styles.wrap} ${styles.footer}`}>
        <span>© {year} Docversity</span>
        <nav aria-label="Portal access and contact">
          <Link href="/student/login" prefetch={false}>
            Student portal
          </Link>
          <Link href="/admin/login" prefetch={false}>
            Staff access
          </Link>
          <Link href="/contact" prefetch={false}>
            Contact
          </Link>
        </nav>
      </footer>
    </div>
  );
}
