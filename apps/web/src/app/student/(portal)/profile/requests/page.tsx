import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentProfileRequests } from '@/features/student-portal/student-pages';
import { getStudentProfileRequests, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Profile update requests' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string | string[] }>;
}) {
  await connection();
  const [state, requests] = await Promise.all([
    getStudentSessionState(),
    getStudentProfileRequests(),
  ]);
  if (state.status !== 'authenticated') return null;
  const { submitted } = await searchParams;
  return <StudentProfileRequests requests={requests} submitted={submitted === '1'} />;
}
