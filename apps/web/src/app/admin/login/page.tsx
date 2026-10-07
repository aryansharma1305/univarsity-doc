import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { LoginForm } from '@/features/auth/login-form';
import { getSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Staff sign in — DOCVERSITY' };

export default async function AdminLoginPage() {
  await connection();
  const state = await getSessionState();
  if (state.status === 'authenticated') redirect('/admin');

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">DOCVERSITY</h1>
        <p className="mt-1 text-slate-600">Staff sign in</p>
      </header>
      {state.status === 'unavailable' && (
        <p
          role="status"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Sign-in is temporarily unavailable. Please try again shortly.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
