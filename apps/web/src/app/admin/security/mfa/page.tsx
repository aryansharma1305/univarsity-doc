import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { KeyRoundIcon, ShieldCheckIcon, SmartphoneIcon } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { MfaEnrollment } from '@/features/auth/mfa-enrollment';
import { getSessionState } from '@/lib/server-auth';
import { STEP_PATHS } from '@/lib/staff-steps';

export const metadata: Metadata = { title: 'Two-step verification setup' };

const HIGHLIGHTS = [
  {
    icon: SmartphoneIcon,
    title: 'Any authenticator app',
    body: 'Codes change every 30 seconds and work without a network connection.',
  },
  {
    icon: KeyRoundIcon,
    title: 'Recovery codes',
    body: 'You receive one-time recovery codes in case you lose your phone.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Shown once',
    body: 'The setup key and recovery codes are never shown again.',
  },
] as const;

export default async function MfaSetupPage() {
  await connection();
  const state = await getSessionState();
  if (state.status === 'anonymous') redirect('/admin/login');
  const user = state.status === 'authenticated' ? state.user : null;
  if (user?.nextStep === 'MFA_VERIFY' || user?.nextStep === 'PASSWORD_CHANGE') {
    redirect(STEP_PATHS[user.nextStep]);
  }
  const required = user?.nextStep === 'MFA_ENROLL';
  return (
    <AuthShell
      audience="staff"
      title="Two-step verification"
      description={
        user?.mfaEnabled
          ? 'Your account already uses an authenticator app.'
          : 'Link an authenticator app to your staff account.'
      }
      unavailable={state.status === 'unavailable'}
      statement={
        <>
          A second key, <em>on your phone.</em>
        </>
      }
      highlights={HIGHLIGHTS}
    >
      {user?.mfaEnabled ? (
        <p className="text-sm text-muted-foreground">
          To move to a new phone, ask a system administrator to reset your access, then set it up
          again.
        </p>
      ) : (
        <MfaEnrollment required={required} />
      )}
      {required ? null : (
        <Link href="/admin" className="mt-4 inline-block text-sm underline">
          Back to the workspace
        </Link>
      )}
    </AuthShell>
  );
}
