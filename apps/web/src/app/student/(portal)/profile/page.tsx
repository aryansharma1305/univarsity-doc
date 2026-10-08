import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentProfile } from '@/features/student-portal/student-pages';
import { getStudentProfileRequests, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'My Profile' };

export default async function Page() {
  await connection();
  const [state, requests] = await Promise.all([
    getStudentSessionState(),
    getStudentProfileRequests(),
  ]);
  if (state.status !== 'authenticated') return null;
  return <StudentProfile me={state.me} requests={requests} />;
}
