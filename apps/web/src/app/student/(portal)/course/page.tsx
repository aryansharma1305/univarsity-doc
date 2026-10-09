import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentCourses } from '@/features/student-portal/student-pages';
import { getStudentCurriculum, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Course Details' };

export default async function Page() {
  await connection();
  const [state, curricula] = await Promise.all([getStudentSessionState(), getStudentCurriculum()]);
  if (state.status !== 'authenticated') return null;
  return <StudentCourses me={state.me} curricula={curricula} />;
}
