'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LogOutIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@docversity/ui/components/button';
import { Wordmark } from '@/components/brand/wordmark';
import { errorMessage } from '@/lib/api';
import { studentPortalApi } from './api';

/** Student portal frame: brand, the student's name, sign out. No staff navigation, ever. */
export function StudentShell({ name, children }: { name: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#student-main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-card focus:p-2"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/student" className="rounded-md" aria-label="Student portal home">
            <Wordmark />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-navy-950 sm:inline">{name}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setPending(true);
                studentPortalApi
                  .logout()
                  .then(() => {
                    router.replace('/student/login');
                    router.refresh();
                  })
                  .catch((error: unknown) => {
                    toast.error(errorMessage(error));
                    setPending(false);
                  });
              }}
            >
              <LogOutIcon aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="student-main" className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
