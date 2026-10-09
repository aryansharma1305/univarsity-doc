import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentReExamApplications } from '@/features/student-portal/student-re-exam-applications';
import { getStudentReExamApplications, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'My re-exam applications' };

export default async function Page() {
  await connection();
  const [state, applications] = await Promise.all([
    getStudentSessionState(),
    getStudentReExamApplications(),
  ]);
  if (state.status !== 'authenticated') return null;
  return <StudentReExamApplications applications={applications} />;
}
