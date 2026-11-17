import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { KeyRoundIcon, LogOutIcon, ShieldCheckIcon } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { getSessionState } from '@/lib/server-auth';
import { STEP_PATHS } from '@/lib/staff-steps';

export const metadata: Metadata = { title: 'Change password' };

const HIGHLIGHTS = [
  {
    icon: KeyRoundIcon,
    title: 'Your own password',
    body: 'A password you were given must be replaced before you can continue.',
  },
  {
    icon: LogOutIcon,
    title: 'Other sessions end',
    body: 'Changing the password signs you out everywhere else.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Never shared',
    body: 'Docversity staff will never ask for your password.',
  },
] as const;

export default async function ChangePasswordPage() {
  await connection();
  const state = await getSessionState();
  if (state.status === 'anonymous') redirect('/admin/login');
  const step = state.status === 'authenticated' ? state.user.nextStep : null;
  if (step === 'MFA_VERIFY' || step === 'MFA_ENROLL') redirect(STEP_PATHS[step]);
  const required = step === 'PASSWORD_CHANGE';
  return (
    <AuthShell
      audience="staff"
      title={required ? 'Choose a new password' : 'Change password'}
      description={
        required
          ? 'Before you continue, replace the password you were given with one only you know.'
          : 'Enter your current password and choose a new one.'
      }
      unavailable={state.status === 'unavailable'}
      statement={
        <>
          Your account, <em>your password.</em>
        </>
      }
      highlights={HIGHLIGHTS}
    >
      <ChangePasswordForm />
      {required ? null : (
        <Link href="/admin" className="mt-4 inline-block text-sm underline">
          Back to the workspace
        </Link>
      )}
    </AuthShell>
  );
}
