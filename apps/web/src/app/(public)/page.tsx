import type { Metadata } from 'next';
import { Instrument_Serif } from 'next/font/google';
import { Capabilities } from '@/components/landing/capabilities';
import { Faq } from '@/components/landing/faq';
import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { LandingMotion } from '@/components/landing/landing-motion';
import { MobileCtaBar } from '@/components/landing/mobile-cta-bar';
import { QuickAccess } from '@/components/landing/quick-access';
import { Roadmap } from '@/components/landing/roadmap';

const TITLE = 'Docversity — Everything academic. One intelligent workspace.';
const DESCRIPTION = 'Your profile, course, documents and examinations in one student portal.';

export const metadata: Metadata = {
  // Absolute URLs for the share image; WEB_URL is the public origin (see .env.example).
  metadataBase: new URL(process.env.WEB_URL ?? 'http://localhost:3000'),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Docversity', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

// Editorial accent face — loaded only by the landing page.
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  variable: '--font-lp-serif',
  display: 'swap',
});

/*
 * Pre-paint guard for the GSAP hero intro: hides the animated elements until GSAP has set their
 * starting state, so they never flash in their final position first. Skipped for reduced-motion
 * users, and lifted after 2.5 s if GSAP has not loaded — the page never stays hidden.
 */
const MOTION_GUARD = `(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var b=document.body;b.setAttribute('data-lp-motion','');setTimeout(function(){if(!window.__lpReady)b.removeAttribute('data-lp-motion')},2500)}catch(e){}})();`;

export default function HomePage() {
  return (
    <div data-lp-root className={serif.variable}>
      <script dangerouslySetInnerHTML={{ __html: MOTION_GUARD }} />
      <LandingMotion>
        <Hero />
        <QuickAccess />
        <Capabilities />
        <HowItWorks />
        <Roadmap />
        <Faq />
        <FinalCta />
        <MobileCtaBar />
      </LandingMotion>
    </div>
  );
}
