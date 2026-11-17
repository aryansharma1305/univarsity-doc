'use client';

import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import {
  type AuthUser,
  type MfaEnrollmentStartResponse,
  mfaEnrollmentConfirmResponseSchema,
  mfaEnrollmentStartResponseSchema,
} from '@docversity/validation';
import { ApiError, apiRequest, resetApiClient } from '@/lib/api';
import { pathAfterSignIn } from '@/lib/staff-steps';

type State =
  | { phase: 'intro' }
  | { phase: 'scan'; enrollment: MfaEnrollmentStartResponse }
  /** `user` is null when the API could not rotate the session: the user must sign in again. */
  | { phase: 'codes'; recoveryCodes: string[]; user: AuthUser | null };

/**
 * Authenticator-app enrollment: start → scan the QR code (or type the key) → confirm with the current
 * password and a current code → save the one-time recovery codes. The secret and the codes are shown
 * only here, once. Confirming re-authenticates (the API checks the password) and rotates the session.
 * If the rotation failed (`reauthenticate: true`), MFA is still on and the codes are still shown; after
 * they are acknowledged the user is sent to the sign-in page.
 */
export function MfaEnrollment({ required }: { required: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'intro' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const enrollment = await apiRequest(
        'POST',
        'auth/mfa/enrollment',
        mfaEnrollmentStartResponseSchema,
      );
      setState({ phase: 'scan', enrollment });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not start the setup.');
    } finally {
      setPending(false);
    }
  }

  async function confirm(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    setPending(true);
    setError(null);
    try {
      const result = await apiRequest(
        'POST',
        'auth/mfa/enrollment/confirm',
        mfaEnrollmentConfirmResponseSchema,
        { body: { currentPassword: field('currentPassword'), code: field('code') } },
      );
      // The API issued a new session ID; drop the CSRF token bound to the old one.
      resetApiClient();
      setState({
        phase: 'codes',
        recoveryCodes: result.recoveryCodes,
        user: result.reauthenticate ? null : result.user,
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'MFA_ENROLLMENT_EXPIRED') {
        setState({ phase: 'intro' });
      }
      setError(
        caught instanceof ApiError
          ? caught.code === 'AUTH_INVALID_CREDENTIALS'
            ? 'The current password is not correct.'
            : caught.message
          : 'Could not confirm the code.',
      );
    } finally {
      setPending(false);
    }
  }

  function finish(user: AuthUser | null) {
    resetApiClient();
    router.replace(user ? pathAfterSignIn(user.nextStep) : '/admin/login');
    router.refresh();
  }

  const alert = (
    <p role="alert" aria-live="polite" className="min-h-5 text-sm font-medium text-danger-text">
      {error}
    </p>
  );

  if (state.phase === 'intro') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {required
            ? 'Two-step verification is required for staff accounts. '
            : 'Protect your account with a second step at sign-in. '}
          You need an authenticator app (for example Google Authenticator, Microsoft Authenticator,
          1Password or Authy) on your phone.
        </p>
        {alert}
        <Button type="button" onClick={() => void start()} disabled={pending} className="h-10">
          {pending ? 'Preparing…' : 'Set up authenticator app'}
        </Button>
      </div>
    );
  }

  if (state.phase === 'scan') {
    const { enrollment } = state;
    return (
      <form onSubmit={(event) => void confirm(event)} className="flex flex-col gap-4" noValidate>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>Scan this QR code with your authenticator app.</li>
          <li>Enter your current password and the 6-digit code the app shows to finish.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element -- inline data: URL, nothing to optimise */}
        <img
          src={enrollment.qrSvgDataUrl}
          alt="QR code for your authenticator app"
          width={192}
          height={192}
          className="self-center rounded-md border bg-white p-2"
        />
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Can&apos;t scan? Enter this key instead:</span>
          <code
            data-testid="mfa-secret"
            className="rounded-md bg-muted px-2 py-1 font-mono break-all tracking-wider"
          >
            {enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}
          </code>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mfa-current-password" className="text-label">
            Current password
          </Label>
          <Input
            id="mfa-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mfa-confirm-code" className="text-label">
            Authenticator code
          </Label>
          <Input
            id="mfa-confirm-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            className="h-10 font-mono tracking-widest"
          />
        </div>
        {alert}
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? 'Checking…' : 'Confirm and turn on'}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium" role="status">
        Two-step verification is on.
      </p>
      <p className="text-sm text-muted-foreground">
        Save these recovery codes somewhere safe (a password manager or printed copy). Each works
        once if you lose your phone. They will not be shown again.
      </p>
      {state.user === null ? (
        <p data-testid="mfa-reauthenticate" className="text-sm font-medium" role="note">
          For your security you will need to sign in again (with your password and authenticator
          code) after saving these codes.
        </p>
      ) : null}
      <ul
        data-testid="recovery-codes"
        className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm"
      >
        {state.recoveryCodes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button
        type="button"
        onClick={() => {
          finish(state.user);
        }}
        className="h-10"
      >
        {state.user === null
          ? 'I have saved my recovery codes — sign in again'
          : 'I have saved my recovery codes'}
      </Button>
    </div>
  );
}
