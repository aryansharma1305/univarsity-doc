import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftIcon, type LucideIcon } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import crest from '@/features/public-verification/university-crest.png';
import { AuthAmbient } from './auth-ambient';
import styles from './auth-shell.module.css';

export interface AuthHighlight {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Optional hook for CSS-only focus feedback (e.g. activation steps follow the focused field). */
  step?: 'code' | 'password' | 'portal';
}

/**
 * Shared frame for staff sign-in, student sign-in and student activation (UI-06). Presentation only:
 * the page passes its existing form, heading, description and availability notice unchanged. The
 * brand panel carries the homepage's navy/gold world; the form side stays on the light product
 * surface used inside the portals.
 */
export function AuthShell({
  audience,
  title,
  description,
  unavailable,
  statement,
  highlights,
  children,
}: {
  audience: 'student' | 'staff' | 'activation';
  title: string;
  description: string;
  unavailable: boolean;
  /** Large line in the brand panel (plain text, never a heading). */
  statement: ReactNode;
  highlights: readonly AuthHighlight[];
  children: ReactNode;
}) {
  const student = audience !== 'staff';
  return (
    <div className={styles.shell} data-audience={audience}>
      <aside
        className={styles.brand}
        aria-label={student ? 'About the student portal' : 'About staff access'}
      >
        <AuthAmbient className={styles.ambient}>
          <div className={styles.glow} />
          <svg viewBox="0 0 400 400" className={styles.orbits}>
            <g className={styles.orbitOuter}>
              <circle cx="200" cy="200" r="190" fill="none" stroke="#ffc928" strokeOpacity="0.3" />
              <circle cx="200" cy="10" r="4.5" fill="#ffc928" />
            </g>
            <g className={styles.orbitInner}>
              <circle cx="200" cy="200" r="146" fill="none" stroke="#168cff" strokeOpacity="0.4" />
              <circle
                cx="200"
                cy="200"
                r="146"
                fill="none"
                stroke="#168cff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="48 870"
              />
              <circle cx="54" cy="200" r="3.5" fill="#168cff" />
            </g>
          </svg>
          <Image
            src={crest}
            alt=""
            priority
            sizes="(max-width: 1023px) 96px, 220px"
            className={styles.crest}
          />
        </AuthAmbient>

        <div className={styles.brandTop}>
          <Link href="/" className={styles.homeLink} aria-label="Docversity home">
            <Wordmark inverted />
          </Link>
        </div>

        <div className={styles.story}>
          <p className={styles.statement}>{statement}</p>
          <ul className={styles.highlights}>
            {highlights.map((item) => (
              <li key={item.title} className={styles.highlight} data-step={item.step}>
                <span className={styles.highlightIcon} aria-hidden="true">
                  <item.icon />
                </span>
                <span>
                  <span className={styles.highlightTitle}>{item.title}</span>
                  <span className={styles.highlightBody}>{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.brandFoot}>Docversity · Academic Verification &amp; Records Portal</p>
      </aside>

      <main id="main" className={styles.formSide}>
        <div className={styles.formColumn}>
          <nav aria-label="Choose how to sign in" className={styles.switch}>
            <Link
              href="/student/login"
              aria-current={audience === 'student' ? 'page' : undefined}
              data-active={student}
            >
              Student <span className={styles.srOnly}>sign in</span>
            </Link>
            <Link
              href="/admin/login"
              aria-current={audience === 'staff' ? 'page' : undefined}
              data-active={!student}
            >
              Staff <span className={styles.srOnly}>sign in</span>
            </Link>
            <span className={styles.switchThumb} aria-hidden="true" />
          </nav>

          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>

          {unavailable && (
            <p role="status" className={styles.unavailable}>
              Sign-in is temporarily unavailable. Please try again shortly.
            </p>
          )}

          <div className={styles.card}>{children}</div>

          <Link href="/" className={styles.back}>
            <ArrowLeftIcon aria-hidden="true" />
            Back to the homepage
          </Link>
        </div>
      </main>
    </div>
  );
}
