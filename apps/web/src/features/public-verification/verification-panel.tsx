'use client';

import { useId, useState, type SyntheticEvent } from 'react';
import { ArrowRightIcon } from 'lucide-react';
import type { PublicVerificationService } from '@docversity/validation';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import styles from './verification-panel.module.css';

const SERVICES = {
  'admission-letter': {
    title: 'Verify Admission Letter',
    placeholder: 'Enter admission letter number',
  },
  certificate: {
    title: 'Verify Certificate',
    placeholder: 'Enter the code printed on the certificate',
  },
  registration: {
    title: 'Verify Registration',
    placeholder: 'Enter registration number',
  },
  result: {
    title: 'Check Result',
    placeholder: 'Enter result code or registration number',
  },
} satisfies Record<PublicVerificationService, { title: string; placeholder: string }>;

/** Public lookup is unavailable: keep references local until an approved lookup exists. */
export function VerificationPanel({ service }: { service: PublicVerificationService }) {
  const id = useId();
  const [submitted, setSubmitted] = useState(false);
  const { title, placeholder } = SERVICES[service];

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) setSubmitted(true);
  }

  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} className={styles.title}>
        {title}
      </h1>
      <form className={styles.box} onSubmit={onSubmit}>
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          className={styles.input}
          required
          maxLength={128}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-result`}
          onChange={() => {
            setSubmitted(false);
          }}
        />
        <Button type="submit" className={styles.verify}>
          Verify
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </form>
      <div
        id={`${id}-result`}
        className={styles.result}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className={styles.resultTitle}>Coming in a later phase</p>
        <p>
          {submitted
            ? 'Verification is not available yet. No record has been checked.'
            : 'Public verification is not available yet.'}
        </p>
      </div>
    </section>
  );
}
