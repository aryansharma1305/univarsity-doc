import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ClipboardCheckIcon, ScrollTextIcon, TimerResetIcon } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';
import { getSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Staff sign in' };

const HIGHLIGHTS = [
  {
    icon: ClipboardCheckIcon,
    title: 'Permissions by role',
    body: 'You see the records workspaces your role allows.',
  },
  {
    icon: ScrollTextIcon,
    title: 'Every change recorded',
    body: 'Changes to academic records are written to the audit log.',
  },
  {
    icon: TimerResetIcon,
    title: 'Sessions that expire',
    body: 'Idle sessions end automatically; repeated failed attempts are limited.',
  },
] as const;

export default async function AdminLoginPage() {
  await connection();
  const state = await getSessionState();
  if (state.status === 'authenticated') redirect('/admin');

  return (
    <AuthShell
      audience="staff"
      title="Staff sign in"
      description="For authorised university staff only."
      unavailable={state.status === 'unavailable'}
      statement={
        <>
          The records workspace, <em>handled with care.</em>
        </>
      }
      highlights={HIGHLIGHTS}
    >
      <LoginForm />
    </AuthShell>
  );
}
