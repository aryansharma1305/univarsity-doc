'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useId, useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import { ApiError, errorMessage } from '@/lib/api';
import { studentPortalApi } from './api';

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function FormField({
  name,
  label,
  hint,
  error,
  ...input
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
} & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-label">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        className="h-10"
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].join(' ').trim() || undefined
        }
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-meta">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger-text"
    >
      {message}
    </p>
  );
}

/** Student sign-in: registration number + password. */
export function StudentLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await studentPortalApi.login({
        registrationNumber: text(form, 'registrationNumber'),
        password: text(form, 'password'),
      });
      router.replace('/student');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'AUTH_INVALID_CREDENTIALS'
          ? 'The registration number or password is incorrect, or the account has not been activated yet.'
          : errorMessage(caught),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormField
        name="registrationNumber"
        label="Registration number"
        autoComplete="username"
        required
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        Sign in
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        First time here?{' '}
        <Link href="/student/register" className="font-medium text-brand hover:underline">
          Activate your account
        </Link>
      </p>
    </form>
  );
}

/**
 * Activation: registration number + the single-use code from the university + a new password.
 * The registration number alone is never enough to claim an account.
 */
export function StudentActivationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});
    const password = text(form, 'password');
    if (password !== text(form, 'confirmPassword')) {
      setFieldErrors({ confirmPassword: 'The passwords do not match.' });
      return;
    }
    setPending(true);
    try {
      await studentPortalApi.activate({
        registrationNumber: text(form, 'registrationNumber'),
        activationCode: text(form, 'activationCode'),
        password,
      });
      router.replace('/student');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.details.length > 0) {
        setFieldErrors(
          Object.fromEntries(caught.details.map((detail) => [detail.path, detail.message])),
        );
        setError(
          caught.code === 'AUTH_PASSWORD_POLICY'
            ? 'Choose a stronger password.'
            : 'Check the highlighted fields.',
        );
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormField
        name="registrationNumber"
        label="Registration number"
        autoComplete="username"
        required
        error={fieldErrors.registrationNumber}
      />
      <FormField
        name="activationCode"
        label="Activation code"
        hint="The 12-character code from the university, e.g. ABCD-EFGH-JKLM."
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        required
        error={fieldErrors.activationCode}
      />
      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A short sentence is easy to remember."
        required
        error={fieldErrors.password}
      />
      <FormField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.confirmPassword}
      />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        Activate account
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already activated?{' '}
        <Link href="/student/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
