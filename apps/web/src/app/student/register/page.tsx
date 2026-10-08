import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { StudentActivationForm } from '@/features/student-portal/auth-forms';
import { StudentAuthPage } from '@/features/student-portal/auth-page';
import { getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Activate your student account' };

export default async function StudentRegisterPage() {
  await connection();
  const state = await getStudentSessionState();
  if (state.status === 'authenticated') redirect('/student');
  return (
    <StudentAuthPage
      title="Activate your account"
      description="Enter your registration number and the activation code issued by the university, then choose a password. A new code also lets you reset a forgotten password."
      unavailable={state.status === 'unavailable'}
    >
      <StudentActivationForm />
    </StudentAuthPage>
  );
}
