'use client';

import { useId, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import type { PublicVerificationService } from '@docversity/validation';
import { storeHeroSearch } from './search-handoff';
import { SERVICES } from './verification-panel';
import styles from './verification-home.module.css';

const OPTIONS = [
  { service: 'certificate', href: '/verify/certificate' },
  { service: 'registration', href: '/verify/registration' },
  { service: 'admission-letter', href: '/verify/admission-letter' },
  { service: 'result', href: '/results' },
] as const satisfies readonly { service: PublicVerificationService; href: string }[];

/** Homepage search: service first, then the number. Opens that service's page, which runs the check once. */
export function HeroSearch() {
  const id = useId();
  const router = useRouter();
  const [service, setService] = useState<PublicVerificationService | ''>('');
  const [reference, setReference] = useState('');
  const placeholder = service ? SERVICES[service].placeholder : 'Enter your registration number';

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const option = OPTIONS.find((item) => item.service === service);
    const value = reference.trim();
    if (!option || !event.currentTarget.reportValidity()) return;
    storeHeroSearch(option.service, value);
    router.push(option.href);
  }

  return (
    <form className={styles.search} role="search" aria-label="Verify a record" onSubmit={submit}>
      <label htmlFor={`${id}-service`} className="sr-only">
        Service
      </label>
      <span className={styles.selectWrap}>
        <select
          id={`${id}-service`}
          className={styles.searchSelect}
          value={service}
          onChange={(event) => {
            setService(event.target.value as PublicVerificationService);
          }}
          required
        >
          <option value="" disabled>
            Select Service
          </option>
          {OPTIONS.map(({ service: value }) => (
            <option key={value} value={value}>
              {SERVICES[value].title}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden="true" />
      </span>
      <label htmlFor={`${id}-reference`} className="sr-only">
        {service ? SERVICES[service].label : 'Registration number'}
      </label>
      <input
        id={`${id}-reference`}
        className={styles.searchInput}
        placeholder={placeholder}
        value={reference}
        onChange={(event) => {
          setReference(event.target.value);
        }}
        required
        minLength={3}
        maxLength={128}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className={styles.searchButton}>
        <SearchIcon aria-hidden="true" />
        Search
      </button>
    </form>
  );
}
