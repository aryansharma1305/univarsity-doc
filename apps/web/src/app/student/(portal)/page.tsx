import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentOverview } from '@/features/student-portal/student-overview';
import {
  getStudentDocuments,
  getStudentProfileRequests,
  getStudentSessionState,
} from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Student portal' };

export default async function StudentHomePage() {
  await connection();
  const [state, requests, documents] = await Promise.all([
    getStudentSessionState(),
    getStudentProfileRequests(),
    getStudentDocuments(),
  ]);
  // The layout already redirected anonymous visitors.
  if (state.status !== 'authenticated') return null;
  return <StudentOverview me={state.me} requests={requests ?? []} documents={documents ?? []} />;
}
