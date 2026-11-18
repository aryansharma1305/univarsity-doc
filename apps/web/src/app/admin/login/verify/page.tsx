import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { KeyRoundIcon, ShieldCheckIcon, TimerResetIcon } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { MfaVerifyForm } from '@/features/auth/mfa-verify-form';
import { getSessionState } from '@/lib/server-auth';
import { pathAfterSignIn } from '@/lib/staff-steps';

export const metadata: Metadata = { title: 'Two-step verification' };

const HIGHLIGHTS = [
  {
    icon: ShieldCheckIcon,
    title: 'Password alone is not enough',
    body: 'Staff accounts confirm every sign-in with an authenticator app.',
  },
  {
    icon: KeyRoundIcon,
    title: 'Lost your phone?',
    body: 'Use one of your recovery codes, or ask a system administrator to reset your access.',
  },
  {
    icon: TimerResetIcon,
    title: 'Five minutes',
    body: 'Finish this step within five minutes or sign in again.',
  },
] as const;

export default async function MfaVerifyPage() {
  await connection();
  const state = await getSessionState();
  if (state.status === 'anonymous') redirect('/admin/login');
  if (state.status === 'authenticated' && state.user.nextStep !== 'MFA_VERIFY') {
    redirect(pathAfterSignIn(state.user.nextStep));
  }
  return (
    <AuthShell
      audience="staff"
      title="Two-step verification"
      description="Enter the code from your authenticator app to finish signing in."
      unavailable={state.status === 'unavailable'}
      statement="Welcome to Staff Login Centre"
      highlights={HIGHLIGHTS}
    >
      <MfaVerifyForm />
    </AuthShell>
  );
}
