import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentRequests } from '@/features/student-portal/student-requests';
import { getStudentProfileRequests, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'My Requests' };

export default async function Page() {
  await connection();
  const [state, requests] = await Promise.all([
    getStudentSessionState(),
    getStudentProfileRequests(),
  ]);
  if (state.status !== 'authenticated') return null;
  return <StudentRequests requests={requests} />;
}
