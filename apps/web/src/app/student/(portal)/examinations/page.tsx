import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentExaminationsPage } from '@/features/student-portal/student-examinations';
import { getStudentExaminations, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Examinations' };

export default async function Page() {
  await connection();
  const [state, data] = await Promise.all([getStudentSessionState(), getStudentExaminations()]);
  if (state.status !== 'authenticated') return null;
  return <StudentExaminationsPage data={data} />;
}
