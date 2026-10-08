import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Wordmark } from '@/components/brand/wordmark';
import { LoginForm } from '@/features/auth/login-form';
import { getSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Staff sign in' };

export default async function AdminLoginPage() {
  await connection();
  const state = await getSessionState();
  if (state.status === 'authenticated') redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-info-soft to-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Link href="/" className="rounded-md" aria-label="Docversity home">
            <Wordmark />
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-raised">
          <h1 className="text-section-title text-navy-950">Staff sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            For authorised university staff only.
          </p>
          {state.status === 'unavailable' && (
            <p
              role="status"
              className="mb-4 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning-text"
            >
              Sign-in is temporarily unavailable. Please try again shortly.
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
