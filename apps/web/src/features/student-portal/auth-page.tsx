import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/brand/wordmark';

/** Frame for the student sign-in and activation pages (separate from staff sign-in). */
export function StudentAuthPage({
  title,
  description,
  unavailable,
  children,
}: {
  title: string;
  description: string;
  unavailable: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-info-soft to-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Link href="/" className="rounded-md" aria-label="Docversity home">
            <Wordmark />
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-raised">
          <p className="text-meta font-medium tracking-wide uppercase">Student portal</p>
          <h1 className="text-section-title text-navy-950">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
          {unavailable && (
            <p
              role="status"
              className="mb-4 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning-text"
            >
              Sign-in is temporarily unavailable. Please try again shortly.
            </p>
          )}
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          University staff?{' '}
          <Link href="/admin/login" className="font-medium text-brand hover:underline">
            Staff sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
