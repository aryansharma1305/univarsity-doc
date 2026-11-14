import type { ReactNode } from 'react';
import { KeyRoundIcon, LogInIcon, TicketIcon } from 'lucide-react';
import { AuthShell, type AuthHighlight } from '@/components/auth/auth-shell';

const ACTIVATION_STEPS: readonly AuthHighlight[] = [
  {
    icon: TicketIcon,
    title: 'Your code from the registrar',
    body: 'Registration number plus the single-use activation code.',
    step: 'code',
  },
  {
    icon: KeyRoundIcon,
    title: 'A password only you know',
    body: 'At least 12 characters — a short sentence works well.',
    step: 'password',
  },
  {
    icon: LogInIcon,
    title: 'Straight into your portal',
    body: 'You are signed in as soon as the account is active.',
    step: 'portal',
  },
];

/** Frame for the student sign-in and activation pages (separate from staff sign-in). */
export function StudentAuthPage({
  title,
  description,
  unavailable,
  variant = 'sign-in',
  children,
}: {
  title: string;
  description: string;
  unavailable: boolean;
  variant?: 'sign-in' | 'activation';
  children: ReactNode;
}) {
  const activation = variant === 'activation';
  return (
    <AuthShell
      audience={activation ? 'activation' : 'student'}
      title={title}
      description={description}
      unavailable={unavailable}
      statement={
        activation ? (
          <>
            Open your account <em>in three steps.</em>
          </>
        ) : (
          'Welcome to Verification Portal'
        )
      }
      highlights={activation ? ACTIVATION_STEPS : []}
    >
      {children}
    </AuthShell>
  );
}
