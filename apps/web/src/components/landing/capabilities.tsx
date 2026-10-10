'use client';

import { motion, useReducedMotion } from 'motion/react';
import { SmartphoneIcon } from 'lucide-react';
import { type Feature, FEATURES } from './content';
import { SpotlightLayer, trackSpotlight } from './interactions';
import { SectionHeading } from './primitives';
import { StudentPhone } from './product-mockups';

const EASE = [0.22, 1, 0.36, 1] as const;

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.7, ease: EASE, delay: (index % 4) * 0.06 }}
      whileHover={reduce ? undefined : { y: -3 }}
      onPointerMove={trackSpotlight}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-lp-hairline bg-lp-surface p-6 transition-[border-color,box-shadow] duration-300 hover:border-lp-accent/25 hover:shadow-lp-float"
    >
      <SpotlightLayer />
      <span className="relative flex size-10 items-center justify-center rounded-xl bg-lp-accent-tint text-lp-accent transition-colors duration-300 group-hover:bg-lp-accent group-hover:text-lp-cta-fg">
        <feature.icon aria-hidden="true" className="size-5" />
      </span>
      <div className="relative flex flex-col gap-1.5">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-lp-ink">
          {feature.title}
        </h3>
        <p className="text-[0.9375rem] leading-relaxed text-lp-ink-soft">{feature.description}</p>
      </div>
    </motion.li>
  );
}

/** Feature card for the responsive portal, with the phone mockup rising out of it. */
function MobileCard() {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.8, ease: EASE }}
      className="relative isolate flex flex-col sm:min-h-[26rem] overflow-hidden rounded-2xl bg-navy-950 p-7 text-white sm:col-span-2 lg:row-span-2"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_80%_100%,rgb(7_89_215/0.45),transparent)]"
      />
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/10">
        <SmartphoneIcon aria-hidden="true" className="size-5" />
      </span>
      <h3 className="mt-5 max-w-xs font-heading text-2xl font-bold tracking-tight">
        Made for your phone.
      </h3>
      <p className="mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-white/70">
        The portal works the same on your phone, tablet or laptop, and there is no app to install.
      </p>
      <motion.div
        className="pointer-events-none absolute -right-6 -bottom-40 hidden sm:block"
        initial={reduce ? false : { y: 60, rotate: 0 }}
        whileInView={{ y: 0, rotate: -6 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: EASE, delay: 0.15 }}
      >
        <StudentPhone className="w-60" />
      </motion.div>
    </motion.li>
  );
}

export function Capabilities() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-20 bg-lp-paper py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeading
          id="features-heading"
          eyebrow="Your student portal"
          title={
            <>
              Everything you can do in the portal <span className="lp-serif">today</span>.
            </>
          }
          lead="Check your details, follow your course and download documents the university has published to you, without visiting the office."
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MobileCard />
          {FEATURES.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </ul>
      </div>
    </section>
  );
}
