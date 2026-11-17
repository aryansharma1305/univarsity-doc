import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { getSessionState } from '@/lib/server-auth';
import { STEP_PATHS } from '@/lib/staff-steps';

/**
 * Every page under /admin (except /admin/login) requires a signed-in staff member. This is a UX
 * redirect only — the API enforces authentication and permissions on every request regardless.
 */
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  await connection();
  const state = await getSessionState();
  if (state.status === 'anonymous') redirect('/admin/login');
  if (state.status === 'unavailable') {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4">
        <h1 className="text-page-title text-navy-950">Docversity</h1>
        <p role="status">
          The sign-in service is temporarily unavailable. Please try again shortly.
        </p>
      </main>
    );
  }
  // Restricted sessions (pending authenticator code, required password change or MFA setup) can only
  // finish that step — the API refuses everything else with 403 anyway.
  if (state.user.nextStep) redirect(STEP_PATHS[state.user.nextStep]);
  return <AdminShell user={state.user}>{children}</AdminShell>;
}
