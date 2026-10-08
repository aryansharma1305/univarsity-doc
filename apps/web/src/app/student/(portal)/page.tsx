import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentOverview } from '@/features/student-portal/student-overview';
import { getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Student portal' };

export default async function StudentHomePage() {
  await connection();
  const state = await getStudentSessionState();
  // The layout already redirected anonymous visitors.
  if (state.status !== 'authenticated') return null;
  return <StudentOverview me={state.me} />;
}
