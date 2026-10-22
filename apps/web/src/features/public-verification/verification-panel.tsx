'use client';

import { useState } from 'react';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  ClipboardListIcon,
  IdCardIcon,
  GraduationCapIcon,
  MailIcon,
  LockKeyholeIcon,
  type LucideIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@docversity/ui/components/tabs';
import {
  publicVerificationServices,
  publicVerificationServiceSchema,
  type PublicVerificationService,
} from '@docversity/validation';
import styles from './verification-home.module.css';

const SERVICES: Record<
  PublicVerificationService,
  { title: string; description: string; icon: LucideIcon; message: string }
> = {
  result: {
    title: 'Result Checking',
    description: 'Academic results',
    icon: ClipboardListIcon,
    message:
      'This service will check university-authorized, published results once public disclosure is approved. No results are checked here yet; unpublished marks and student records remain private.',
  },
  registration: {
    title: 'Registration Verification',
    description: 'University registrations',
    icon: IdCardIcon,
    message:
      'This service will check registration records approved by the university for public disclosure. No registration is checked here yet; internal student profiles remain private.',
  },
  certificate: {
    title: 'Certificate Verification',
    description: 'Academic certificates',
    icon: GraduationCapIcon,
    message:
      'This service will check authorized, issued certificates once public verification is approved. No certificate is checked here yet. SAMPLE PDFs and course eligibility are not proof of issuance.',
  },
  'admission-letter': {
    title: 'Admission Letter Verification',
    description: 'Admission letters',
    icon: MailIcon,
    message:
      'This service will check authorized admission letters once issuance provenance and public disclosure are approved. No admission letter is checked here yet; admission records remain private.',
  },
};

/** No identifiers, submissions or activation switch while public verification is unavailable. */
export function VerificationPanel() {
  const [service, setService] = useState<PublicVerificationService>('result');
  const reduced = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user">
      <Tabs
        value={service}
        onValueChange={(value) => {
          const parsed = publicVerificationServiceSchema.safeParse(value);
          if (parsed.success) setService(parsed.data);
        }}
      >
        <TabsList
          aria-label="Choose a verification service"
          className={`${styles.serviceTabs} group-data-[orientation=horizontal]/tabs:h-auto`}
        >
          {publicVerificationServices.map((id) => {
            const { title, description, icon: Icon } = SERVICES[id];
            return (
              <TabsTrigger key={id} value={id} aria-label={title} className={styles.serviceTab}>
                <Icon className={styles.serviceIcon} aria-hidden="true" />
                <span className={styles.serviceTitle}>{title}</span>
                <span className={styles.serviceDescription}>{description}</span>
                <span className={styles.serviceAvailability}>Not available yet</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        {publicVerificationServices.map((id) => (
          <TabsContent key={id} value={id} className={styles.panel}>
            <motion.div
              initial={reduced ? false : { opacity: 0.8, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.16, ease: 'easeOut' }}
            >
              <h2>{SERVICES[id].title}</h2>
              <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
                <LockKeyholeIcon aria-hidden="true" className="size-4" />
                Not available yet
              </p>
              <p className={styles.explanation}>{SERVICES[id].message}</p>
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </MotionConfig>
  );
}
