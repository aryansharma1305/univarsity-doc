import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { StudentShell } from '@/features/student-portal/student-shell';
import { getStudentSessionState } from '@/lib/server-auth';

/**
 * Every student portal page requires a signed-in STUDENT. A UX redirect only — the API enforces the
 * student session and ownership on every request.
 */
export default async function StudentPortalLayout({ children }: { children: ReactNode }) {
  await connection();
  const state = await getStudentSessionState();
  if (state.status === 'anonymous') redirect('/student/login');
  if (state.status === 'unavailable') {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4">
        <h1 className="text-page-title text-navy-950">Docversity</h1>
        <p role="status">
          The student portal is temporarily unavailable. Please try again shortly.
        </p>
      </main>
    );
  }
  return (
    <StudentShell name={state.me.student.fullName} hasPhoto={state.me.student.hasPhoto}>
      {children}
    </StudentShell>
  );
}
