import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentResults } from '@/features/student-portal/student-results';
import { getStudentResults, getStudentSessionState } from '@/lib/server-auth';
export const metadata: Metadata = { title: 'My Results' };
export default async function Page() {
  await connection();
  const [state, results] = await Promise.all([getStudentSessionState(), getStudentResults()]);
  if (state.status !== 'authenticated') return null;
  return <StudentResults results={results} />;
}
