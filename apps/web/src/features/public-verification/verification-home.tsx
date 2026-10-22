'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { ArrowRightIcon, FingerprintIcon, KeyRoundIcon, ShieldCheckIcon } from 'lucide-react';
import { HeroField } from './hero-field';
import {
  HowItWorks,
  LandingFooter,
  LandingHeader,
  Portals,
  Safeguards,
  ServicesIntro,
} from './landing-sections';
import { StudentShowcase } from './student-showcase';
import { useLandingMotion } from './use-landing-motion';
import { VerificationPanel } from './verification-panel';
import crest from './university-crest.png';
import styles from './verification-home.module.css';

const ASSURANCES = [
  { icon: KeyRoundIcon, label: 'Single-use activation codes' },
  { icon: FingerprintIcon, label: 'Only your own records' },
  { icon: ShieldCheckIcon, label: 'Separate staff access' },
] as const;

/**
 * UI-06 public homepage. Student-facing and honest: the four public verification services are
 * explained but cannot be used yet, and every portal capability described exists today. All motion
 * is progressive enhancement (use-landing-motion.ts, hero-field.tsx, student-showcase.tsx).
 */
export function VerificationHome({ year }: { year: number }) {
  const root = useRef<HTMLDivElement>(null);
  useLandingMotion(root);

  return (
    <div ref={root} className={styles.page}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <LandingHeader />
      <main id="main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="verification-title" data-hero>
          <HeroField className={styles.field} />
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div data-ui04-intro className={styles.intro}>
              <div data-hero-depth>
                <h1 id="verification-title" className={styles.headline}>
                  <span className={styles.mask}>
                    <span data-hero-word className={styles.word}>
                      Verify.
                    </span>
                  </span>
                  <br />
                  <span className={styles.mask}>
                    <em data-hero-word className={styles.word}>
                      Trust.
                    </em>
                  </span>{' '}
                  <span className={styles.mask}>
                    <span data-hero-word className={styles.word}>
                      Confirm.
                    </span>
                  </span>
                </h1>
                <p className={styles.subtitle} data-hero-fade>
                  Your academic records, documents and examination services in one secure student
                  portal — with public verification of results and certificates on its way.
                </p>
                <div className={styles.actions} data-hero-fade>
                  <Link href="/student/login" className={styles.primaryAction} prefetch={false}>
                    Sign in to the student portal
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                  <Link
                    href="/student/register"
                    className={styles.secondaryAction}
                    prefetch={false}
                  >
                    Activate your account
                  </Link>
                </div>
                <ul className={styles.assurances} data-hero-fade>
                  {ASSURANCES.map(({ icon: Icon, label }) => (
                    <li key={label}>
                      <Icon aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div data-ui04-intro className={styles.logoStage}>
              <div data-crest-parallax className={styles.crestParallax}>
                <div data-crest-tilt className={styles.crestTilt}>
                  <div data-halo className={styles.halo} aria-hidden="true" />
                  <CrestOrbits />
                  <div data-crest className={styles.crestFrame}>
                    <Image
                      src={crest}
                      alt="Docversity University"
                      priority
                      sizes="(max-width: 560px) 210px, (max-width: 900px) 280px, 360px"
                      className={styles.crest}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <a
            href="#services"
            className={styles.scrollCue}
            aria-label="Scroll to verification services"
          >
            <span aria-hidden="true" />
          </a>
        </section>

        <section
          id="services"
          aria-labelledby="services-title"
          tabIndex={-1}
          className={styles.services}
        >
          <div className={styles.wrap}>
            <ServicesIntro />
            <div data-reveal>
              <VerificationPanel />
            </div>
          </div>
        </section>

        <StudentShowcase />
        <HowItWorks />
        <Safeguards />
        <Portals />
      </main>
      <LandingFooter year={year} />
    </div>
  );
}

/** Gold and blue orbits around the crest, with the Docversity name set on a circular path. */
function CrestOrbits() {
  return (
    <svg viewBox="0 0 500 500" className={styles.orbits} aria-hidden="true">
      <defs>
        <path id="dv-orbit-text" d="M250 250m-205 0a205 205 0 1 1 410 0a205 205 0 1 1-410 0" />
      </defs>
      <g data-orbit="cw">
        <circle
          data-orbit-draw
          pathLength={1}
          strokeDasharray="1"
          cx="250"
          cy="250"
          r="232"
          fill="none"
          stroke="#ffc928"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <circle cx="250" cy="18" r="5" fill="#ffc928" />
        <circle cx="482" cy="250" r="3" fill="#ffc928" fillOpacity="0.7" />
        <text className={styles.orbitText}>
          <textPath href="#dv-orbit-text" textLength="1280" lengthAdjust="spacing">
            DOCVERSITY · ACADEMIC RECORDS PORTAL · VERIFY · TRUST · CONFIRM ·
          </textPath>
        </text>
      </g>
      <g data-orbit="ccw">
        <circle
          data-orbit-draw
          pathLength={1}
          strokeDasharray="1"
          cx="250"
          cy="250"
          r="180"
          fill="none"
          stroke="#168cff"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
        <circle
          cx="250"
          cy="250"
          r="180"
          fill="none"
          stroke="#168cff"
          strokeOpacity="0.9"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="60 1071"
        />
        <circle cx="70" cy="250" r="4" fill="#168cff" />
      </g>
    </svg>
  );
}
