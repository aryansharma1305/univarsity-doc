'use client';

import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import { authUserSchema, errorResponseSchema } from '@docversity/validation';
import { resetApiClient } from '@/lib/api';
import { postJson } from '@/lib/api-client';
import { pathAfterSignIn } from '@/lib/staff-steps';

/** Second sign-in step: a 6-digit authenticator code, or one single-use recovery code. */
export function MfaVerifyForm() {
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('code');
    const text = typeof value === 'string' ? value : '';
    setPending(true);
    setError(null);
    try {
      const response = await postJson(
        '/api/v1/auth/mfa/verify',
        useRecovery ? { recoveryCode: text } : { code: text },
      );
      if (response.ok) {
        resetApiClient(); // the session (and so its CSRF token) was replaced
        const user = authUserSchema.safeParse(await response.json());
        router.replace(pathAfterSignIn(user.success ? user.data.nextStep : null));
        router.refresh();
        return;
      }
      const body = errorResponseSchema.safeParse(await response.json().catch(() => null));
      const code = body.success ? body.data.error.code : '';
      // A pending sign-in that expired (5 minutes) must start again with the password.
      if (code === 'AUTH_SESSION_EXPIRED' || code === 'AUTH_REQUIRED') {
        router.replace('/admin/login');
        router.refresh();
        return;
      }
      setError(
        body.success ? body.data.error.message : 'Unable to verify the code. Please try again.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to verify the code.');
    } finally {
      setPending(false);
    }
  }

  async function startOver() {
    try {
      await postJson('/api/v1/auth/logout');
    } finally {
      resetApiClient();
      router.replace('/admin/login');
      router.refresh();
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mfa-code" className="text-label">
          {useRecovery ? 'Recovery code' : 'Authenticator code'}
        </Label>
        <Input
          key={useRecovery ? 'recovery' : 'totp'}
          id="mfa-code"
          name="code"
          autoComplete={useRecovery ? 'off' : 'one-time-code'}
          inputMode={useRecovery ? 'text' : 'numeric'}
          placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'}
          maxLength={useRecovery ? 20 : 7}
          required
          className="h-10 font-mono tracking-widest"
        />
        <p className="text-sm text-muted-foreground">
          {useRecovery
            ? 'Each recovery code works once.'
            : 'Open your authenticator app and enter the current 6-digit code.'}
        </p>
      </div>
      <p role="alert" aria-live="polite" className="min-h-5 text-sm font-medium text-danger-text">
        {error}
      </p>
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? 'Verifying…' : 'Verify'}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => {
            setUseRecovery((value) => !value);
            setError(null);
          }}
        >
          {useRecovery ? 'Use the authenticator app instead' : 'Use a recovery code'}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => void startOver()}
        >
          Start again
        </Button>
      </div>
    </form>
  );
}
