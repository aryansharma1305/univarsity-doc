'use client';

import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import { resetApiClient } from '@/lib/api';
import { errorMessage, postJson } from '@/lib/api-client';

/** Minimal staff sign-in form (Phase 3). Product design comes with the admin shell later. */
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await postJson('/api/v1/auth/login', {
        email: textField(form, 'email'),
        password: textField(form, 'password'),
      });
      if (response.ok) {
        resetApiClient();
        router.replace('/admin');
        router.refresh();
        return;
      }
      setError(await errorMessage(response, 'Unable to sign in. Please try again.'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email" className="text-label">
          Email
        </Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-10"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password" className="text-label">
          Password
        </Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10"
        />
      </div>
      <p role="alert" aria-live="polite" className="min-h-5 text-sm font-medium text-danger-text">
        {error}
      </p>
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
