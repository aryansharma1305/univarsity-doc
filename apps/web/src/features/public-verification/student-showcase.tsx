'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { LockKeyholeIcon } from 'lucide-react';
import { STUDENT_FEATURES, type StudentFeature } from './landing-content';
import styles from './landing-sections.module.css';

/**
 * "For students": the feature list is ordinary, complete content. On wide screens an illustrated
 * portal screen stays in view and follows the feature being read. The illustration holds no data —
 * only the real page names and neutral placeholder shapes.
 */
export function StudentShowcase() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = items.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const item of items.current) if (item) observer.observe(item);
    return () => {
      observer.disconnect();
    };
  }, []);

  const feature = STUDENT_FEATURES[active] ?? STUDENT_FEATURES[0];

  return (
    <section id="students" aria-labelledby="students-title" className={styles.students}>
      <div className={styles.wrap}>
        <div className={styles.sectionHead} data-reveal>
          <h2 id="students-title" className={styles.sectionTitle}>
            Your university paperwork, <em>finally in one place.</em>
          </h2>
          <p className={styles.sectionLead}>
            Once your account is active, the student portal brings together the things you would
            otherwise chase across offices — on your phone or your laptop.
          </p>
        </div>
        <div className={styles.showcase}>
          <div className={styles.deviceColumn} aria-hidden="true">
            <div className={styles.device}>
              <div className={styles.deviceNotch} />
              <MotionConfig reducedMotion="user">
                <AnimatePresence mode="popLayout" initial={false}>
                  {feature && <PortalScreen key={feature.id} feature={feature} />}
                </AnimatePresence>
              </MotionConfig>
              <div className={styles.deviceNav}>
                {STUDENT_FEATURES.map((item, index) => (
                  <span key={item.id} data-active={index === active} className={styles.deviceDot}>
                    <item.icon />
                  </span>
                ))}
              </div>
            </div>
          </div>
          <ol className={styles.featureList}>
            {STUDENT_FEATURES.map((item, index) => (
              <li
                key={item.id}
                ref={(node) => {
                  items.current[index] = node;
                }}
                data-active={index === active}
                className={styles.feature}
                data-reveal
              >
                <span className={styles.featureIcon} aria-hidden="true">
                  <item.icon />
                </span>
                <div>
                  <h3 className={styles.featureTitle}>{item.title}</h3>
                  <p className={styles.featureBody}>{item.body}</p>
                  {item.note && (
                    <p className={styles.featureNote}>
                      <LockKeyholeIcon aria-hidden="true" />
                      {item.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function PortalScreen({ feature }: { feature: StudentFeature }) {
  const Icon = feature.icon;
  return (
    <motion.div
      className={styles.screen}
      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={styles.screenHeader}>
        <span className={styles.screenIcon}>
          <Icon />
        </span>
        <span className={styles.screenTitle}>{feature.screen}</span>
      </div>
      {feature.id === 'results' ? (
        <div className={styles.screenLocked}>
          <LockKeyholeIcon />
          <span>Not published yet</span>
        </div>
      ) : (
        <div className={styles.screenBody} data-layout={feature.id}>
          <span className={styles.skeletonHero} />
          <span className={styles.skeletonLine} style={{ width: '82%' }} />
          <span className={styles.skeletonLine} style={{ width: '64%' }} />
          <div className={styles.skeletonGrid}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className={styles.skeletonLine} style={{ width: '72%' }} />
          <span className={styles.skeletonAction} />
        </div>
      )}
    </motion.div>
  );
}
