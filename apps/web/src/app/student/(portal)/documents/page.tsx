import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentDocuments } from '@/features/student-portal/student-documents';
import { getStudentDocuments, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'My Documents' };

export default async function Page() {
  await connection();
  const [state, documents] = await Promise.all([getStudentSessionState(), getStudentDocuments()]);
  if (state.status !== 'authenticated') return null;
  return <StudentDocuments documents={documents} />;
}
