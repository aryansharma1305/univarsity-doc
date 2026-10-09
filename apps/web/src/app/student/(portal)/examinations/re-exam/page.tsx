import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentReExamApply } from '@/features/student-portal/student-re-exam';
import { getStudentReExamOptions, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Apply for a re-examination' };

export default async function Page() {
  await connection();
  const [state, options] = await Promise.all([getStudentSessionState(), getStudentReExamOptions()]);
  if (state.status !== 'authenticated') return null;
  return <StudentReExamApply options={options} />;
}
