import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentProfile } from '@/features/student-portal/student-pages';
import { getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'My Profile' };

export default async function Page() {
  await connection();
  const state = await getStudentSessionState();
  if (state.status !== 'authenticated') return null;
  return <StudentProfile me={state.me} />;
}
