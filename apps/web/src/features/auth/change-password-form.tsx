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

/**
 * Change the staff password. Also completes the required first-login / access-reset change; the API
 * then clears the requirement and ends the account's other sessions.
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    setError(null);
    setDetails([]);
    if (field('newPassword') !== field('confirmPassword')) {
      setError('The new passwords do not match.');
      return;
    }
    setPending(true);
    try {
      const response = await postJson('/api/v1/auth/password', {
        currentPassword: field('currentPassword'),
        newPassword: field('newPassword'),
      });
      if (response.ok) {
        resetApiClient();
        const me = await fetch('/api/v1/auth/me', { cache: 'no-store' });
        const user = authUserSchema.safeParse(me.ok ? await me.json() : null);
        router.replace(pathAfterSignIn(user.success ? user.data.nextStep : null));
        router.refresh();
        return;
      }
      const body = errorResponseSchema.safeParse(await response.json().catch(() => null));
      if (!body.success) {
        setError('Unable to change the password. Please try again.');
        return;
      }
      const { code, message } = body.data.error;
      setError(
        code === 'AUTH_INVALID_CREDENTIALS' ? 'The current password is not correct.' : message,
      );
      setDetails((body.data.error.details ?? []).map((detail) => detail.message));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change the password.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
      <PasswordField
        id="current-password"
        name="currentPassword"
        label="Current password"
        current
      />
      <PasswordField id="new-password" name="newPassword" label="New password" />
      <PasswordField id="confirm-password" name="confirmPassword" label="Confirm new password" />
      <p className="text-sm text-muted-foreground">
        At least 12 characters. Avoid common passwords and your name or email address.
      </p>
      <div role="alert" aria-live="polite" className="min-h-5 text-sm font-medium text-danger-text">
        {error}
        {details.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 font-normal">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  );
}

function PasswordField({
  id,
  name,
  label,
  current = false,
}: {
  id: string;
  name: string;
  label: string;
  current?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-label">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete={current ? 'current-password' : 'new-password'}
        required
        className="h-10"
      />
    </div>
  );
}
