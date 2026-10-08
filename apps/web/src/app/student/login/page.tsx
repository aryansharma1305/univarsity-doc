import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { StudentLoginForm } from '@/features/student-portal/auth-forms';
import { StudentAuthPage } from '@/features/student-portal/auth-page';
import { getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Student sign in' };

export default async function StudentLoginPage() {
  await connection();
  const state = await getStudentSessionState();
  if (state.status === 'authenticated') redirect('/student');
  return (
    <StudentAuthPage
      title="Sign in"
      description="Use your registration number and the password you chose when activating your account."
      unavailable={state.status === 'unavailable'}
    >
      <StudentLoginForm />
    </StudentAuthPage>
  );
}
