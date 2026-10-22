'use client';

import Link from 'next/link';
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRightIcon, ArrowUpRightIcon, GraduationCapIcon, ShieldCheckIcon } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { SAFEGUARDS, STEPS } from './landing-content';
import styles from './landing-sections.module.css';

const SECTIONS = [
  { href: '#services', label: 'Verification' },
  { href: '#students', label: 'For students' },
  { href: '#how', label: 'How it works' },
  { href: '#privacy', label: 'Privacy' },
] as const;

/** Landing-only header: transparent over the hero, a frosted navy bar once the page scrolls. */
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <header className={styles.header} data-scrolled={scrolled}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brandLink} aria-label="Docversity home" prefetch={false}>
          <Wordmark inverted />
        </Link>
        <nav aria-label="Sections" className={styles.headerNav}>
          {SECTIONS.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <Link href="/student/login" className={styles.headerCta} prefetch={false}>
          Student sign in
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

export function ServicesIntro() {
  return (
    <div className={styles.sectionHead} data-reveal>
      <h2 id="services-title" className={styles.sectionTitle}>
        Public verification is <em>on its way.</em>
      </h2>
      <p className={styles.sectionLead}>
        Four public services are planned. None of them checks a record yet — choose one to see what
        it will do once the university approves public disclosure.
      </p>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={styles.how}>
      <div className={styles.wrap}>
        <div className={styles.sectionHead} data-reveal>
          <h2 id="how-title" className={styles.sectionTitle}>
            From activation code to portal <em>in three steps.</em>
          </h2>
          <p className={styles.sectionLead}>
            There is no public sign-up. Your account already exists — the university gives you the
            key to open it.
          </p>
        </div>
        <div className={styles.steps} data-steps>
          <div className={styles.rail} aria-hidden="true">
            <span className={styles.railFill} data-rail-fill />
          </div>
          <ol className={styles.stepList}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step} data-step>
                <span className={styles.stepMarker} aria-hidden="true">
                  <step.icon />
                  <span className={styles.stepNumber}>{index + 1}</span>
                </span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <p className={styles.howFoot} data-reveal>
          Already have a code?{' '}
          <Link href="/student/register" prefetch={false}>
            Activate your student account
          </Link>
        </p>
      </div>
    </section>
  );
}

export function Safeguards() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className={styles.safeguards}>
      <div className={`${styles.wrap} ${styles.safeguardsGrid}`}>
        <div className={styles.safeguardsLead} data-reveal>
          <h2 id="privacy-title" className={styles.sectionTitle}>
            Private by default. <em>Careful by design.</em>
          </h2>
          <p className={styles.sectionLead}>
            Academic records are personal. These protections are built into how the portal works —
            not settings anyone has to remember to switch on.
          </p>
          <ShieldArt />
        </div>
        <ul className={styles.safeguardList}>
          {SAFEGUARDS.map((item) => (
            <li key={item.title} className={styles.safeguard} data-reveal>
              <span className={styles.safeguardIcon} aria-hidden="true">
                <item.icon />
              </span>
              <div>
                <h3 className={styles.safeguardTitle}>{item.title}</h3>
                <p className={styles.safeguardBody}>{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Animated shield: outline and keyhole draw on scroll (GSAP), a scan line sweeps slowly. */
function ShieldArt() {
  return (
    <div className={styles.shield} data-shield aria-hidden="true">
      <svg viewBox="0 0 320 340" className={styles.shieldSvg}>
        <defs>
          <linearGradient id="dv-shield-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#168cff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#0759d7" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="dv-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffc928" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffc928" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffc928" stopOpacity="0" />
          </linearGradient>
          <clipPath id="dv-shield-clip">
            <path d="M160 18 40 62v86c0 80 50 140 120 172 70-32 120-92 120-172V62L160 18Z" />
          </clipPath>
        </defs>
        <path
          d="M160 18 40 62v86c0 80 50 140 120 172 70-32 120-92 120-172V62L160 18Z"
          fill="url(#dv-shield-fill)"
        />
        <g clipPath="url(#dv-shield-clip)">
          <rect data-shield-scan x="20" y="150" width="280" height="40" fill="url(#dv-scan)" />
          {[90, 130, 170, 210, 250].map((y) => (
            <line key={y} x1="40" x2="280" y1={y} y2={y} stroke="#ffffff" strokeOpacity="0.05" />
          ))}
        </g>
        <path
          data-shield-draw
          pathLength={1}
          strokeDasharray="1"
          d="M160 18 40 62v86c0 80 50 140 120 172 70-32 120-92 120-172V62L160 18Z"
          fill="none"
          stroke="#ffc928"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          data-shield-draw
          pathLength={1}
          strokeDasharray="1"
          d="M160 42 62 78v72c0 66 41 116 98 143 57-27 98-77 98-143V78L160 42Z"
          fill="none"
          stroke="#168cff"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
        <circle cx="160" cy="150" r="26" fill="none" stroke="#ffc928" strokeWidth="2" />
        <path
          data-shield-draw
          pathLength={1}
          strokeDasharray="1"
          d="M160 168v40"
          stroke="#ffc928"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function trackPointer(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--x', `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty('--y', `${event.clientY - box.top}px`);
}

export function Portals() {
  return (
    <section id="portals" aria-labelledby="portals-title" className={styles.portals}>
      <div className={styles.wrap}>
        <div className={styles.sectionHead} data-reveal>
          <h2 id="portals-title" className={styles.sectionTitle}>
            Choose <em>your door.</em>
          </h2>
        </div>
        <div className={styles.portalGrid}>
          <article
            className={styles.portal}
            data-tone="student"
            onPointerMove={trackPointer}
            data-reveal
          >
            <span className={styles.portalIcon} aria-hidden="true">
              <GraduationCapIcon />
            </span>
            <h3 className={styles.portalTitle}>Students</h3>
            <p className={styles.portalBody}>
              Profile, course, documents, examinations and re-exam applications — for your own
              registration only.
            </p>
            <div className={styles.portalActions}>
              <Link href="/student/login" className={styles.portalPrimary} prefetch={false}>
                Sign in as a student
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link href="/student/register" className={styles.portalSecondary} prefetch={false}>
                Activate a student account
              </Link>
            </div>
          </article>
          <article
            className={styles.portal}
            data-tone="staff"
            onPointerMove={trackPointer}
            data-reveal
          >
            <span className={styles.portalIcon} aria-hidden="true">
              <ShieldCheckIcon />
            </span>
            <h3 className={styles.portalTitle}>University staff</h3>
            <p className={styles.portalBody}>
              The records workspace for authorised staff. Access is granted by the university, and
              every change is recorded.
            </p>
            <div className={styles.portalActions}>
              <Link href="/admin/login" className={styles.portalSecondary} prefetch={false}>
                Go to staff sign in
                <ArrowUpRightIcon aria-hidden="true" />
              </Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter({ year }: { year: number }) {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.wrap} ${styles.footerGrid}`}>
        <div className={styles.footerBrand}>
          <Wordmark inverted />
          <p>Academic Verification &amp; Records Portal.</p>
        </div>
        <nav aria-label="Portal access and contact" className={styles.footerNav}>
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
        <nav aria-label="Information" className={styles.footerNav}>
          <Link href="/help" prefetch={false}>
            Help
          </Link>
          <Link href="/status" prefetch={false}>
            System status
          </Link>
          <Link href="/privacy" prefetch={false}>
            Privacy
          </Link>
          <Link href="/terms" prefetch={false}>
            Terms
          </Link>
        </nav>
      </div>
      <div className={`${styles.wrap} ${styles.footerBase}`}>
        <span>© {year} Docversity</span>
        <span>Public verification is not available yet.</span>
      </div>
    </footer>
  );
}
