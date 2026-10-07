import type { Metadata } from 'next';
import { LogoutButton } from '@/features/auth/logout-button';
import { getSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Admin — DOCVERSITY' };

/** Minimal authenticated page (Phase 3). No dashboard data exists yet, so none is shown. */
export default async function AdminHomePage() {
  const state = await getSessionState();
  if (state.status !== 'authenticated') return null; // the layout already handled this

  const { user } = state;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">DOCVERSITY Admin</h1>
        <p className="mt-1 text-slate-600">You are signed in.</p>
      </header>
      <section
        aria-labelledby="account-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <h2
          id="account-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-500"
        >
          Account
        </h2>
        <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd data-testid="account-name">{user.displayName}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd data-testid="account-email">{user.email}</dd>
          <dt className="text-slate-500">Roles</dt>
          <dd data-testid="account-roles">
            {user.roles.length > 0 ? user.roles.join(', ') : 'None'}
          </dd>
        </dl>
      </section>
      <p className="text-sm text-slate-500">Administration features are added in later phases.</p>
      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
