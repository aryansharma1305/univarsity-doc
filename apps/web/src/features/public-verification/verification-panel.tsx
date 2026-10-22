'use client';

import { useState, useRef } from 'react';
import { motion, MotionConfig, useReducedMotion } from 'motion/react';
import {
  ClipboardListIcon,
  IdCardIcon,
  GraduationCapIcon,
  MailIcon,
  LockKeyholeIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@docversity/ui/components/tabs';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import {
  publicVerificationRequestSchema,
  unavailableVerificationResponseSchema,
  type PublicVerificationService,
} from '@docversity/validation';

const SERVICES = [
  { id: 'result', title: 'Result Checking', detail: 'Academic results', icon: ClipboardListIcon },
  {
    id: 'registration',
    title: 'Registration Verification',
    detail: 'University registrations',
    icon: IdCardIcon,
  },
  {
    id: 'certificate',
    title: 'Certificate Verification',
    detail: 'Academic certificates',
    icon: GraduationCapIcon,
  },
  {
    id: 'admission-letter',
    title: 'Admission Letter Verification',
    detail: 'Admission letters',
    icon: MailIcon,
  },
] as const;

/** Standalone integration seam; UI-04 owns its unmerged homepage and crest composition. */
export function VerificationPanel() {
  const [service, setService] = useState<PublicVerificationService>('result');
  return (
    <MotionConfig reducedMotion="user">
      <Tabs
        value={service}
        onValueChange={(value) => {
          setService(value as PublicVerificationService);
        }}
      >
        <TabsList
          aria-label="Verification services"
          className="grid h-auto w-full group-data-[orientation=horizontal]/tabs:h-auto grid-cols-2 gap-3 bg-transparent p-0 lg:grid-cols-4"
        >
          {SERVICES.map(({ id, title, detail, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="h-full min-h-28 min-w-0 flex-col items-start justify-start gap-2 group/service rounded-xl border border-border bg-white p-4 text-left whitespace-normal text-navy-950 data-[state=active]:border-gold data-[state=active]:bg-navy-950 data-[state=active]:text-white"
            >
              <Icon
                aria-hidden="true"
                className="size-5 shrink-0 text-gold-text group-data-[state=active]/service:text-gold"
              />
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-xs opacity-80">{detail}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {SERVICES.map(({ id, title }) => (
          <TabsContent key={id} value={id} className="mt-5">
            <ServiceForm key={id} service={id} title={title} />
          </TabsContent>
        ))}
      </Tabs>
    </MotionConfig>
  );
}

function ServiceForm({ service, title }: { service: PublicVerificationService; title: string }) {
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const reduced = useReducedMotion();
  const inputId = `reference-${service}`;
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setResult('');
    setError('');
    const parsed = publicVerificationRequestSchema.safeParse({ contractVersion: 1, reference });
    if (!parsed.success) {
      setError(
        'Enter a reference of 3–128 characters using letters, numbers, dots, slashes or hyphens.',
      );
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      // No ambient session, identifier in URL, localStorage, result cache or success-state fallback.
      const response = await fetch(`/api/v1/public/verify/${service}`, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 429) {
        setResult(
          'Too many requests. Please wait a minute before trying again. No record has been checked.',
        );
        return;
      }
      if (!response.ok) throw new Error('unavailable');
      const data = unavailableVerificationResponseSchema.parse(await response.json());
      if (data.service !== service) throw new Error('unexpected service');
      setResult(data.message);
      setReference('');
    } catch {
      setResult('The service is unavailable. No record has been checked. Please try again later.');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <motion.section
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.16 }}
      className="rounded-xl border border-border bg-white p-5 sm:p-7"
      aria-label={title}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-navy-950">
        <LockKeyholeIcon aria-hidden="true" className="size-4" />
        Public verification unavailable
      </div>
      <h2 className="mt-3 text-xl font-semibold text-navy-950">{title}</h2>
      <p id={`${inputId}-help`} className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        No records are checked here yet. Do not enter personal details or private document
        information. A reference alone does not prove identity or authenticity.
      </p>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
        className="mt-5 max-w-xl"
        aria-busy={pending}
      >
        <label htmlFor={inputId} className="text-sm font-medium text-navy-950">
          Reference
        </label>
        <Input
          id={inputId}
          value={reference}
          onChange={(event) => {
            setReference(event.target.value);
            setError('');
          }}
          maxLength={128}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
          className="mt-2 h-11"
          disabled={pending}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="mt-4 min-h-11 w-full bg-navy-950 text-white hover:bg-navy-900 sm:w-auto"
        >
          {pending ? 'Checking availability…' : 'Check service availability'}
        </Button>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-4 text-sm leading-6 text-navy-900"
        >
          {result}
        </p>
      </form>
    </motion.section>
  );
}
