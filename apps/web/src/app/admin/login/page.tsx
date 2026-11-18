import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';
import { pathAfterSignIn } from '@/lib/staff-steps';
import { getSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Staff Login Centre' };

export default async function AdminLoginPage() {
  await connection();
  const state = await getSessionState();
  if (state.status === 'authenticated') redirect(pathAfterSignIn(state.user.nextStep));

  return (
    <AuthShell
      audience="staff"
      unavailable={state.status === 'unavailable'}
      statement="Welcome to Staff Login Centre"
      highlights={[]}
    >
      <LoginForm />
    </AuthShell>
  );
}
