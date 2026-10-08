import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentSettings } from '@/features/student-portal/student-pages';
import { getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Account Settings' };

export default async function Page() {
  await connection();
  const state = await getStudentSessionState();
  if (state.status !== 'authenticated') return null;
  return <StudentSettings me={state.me} />;
}
