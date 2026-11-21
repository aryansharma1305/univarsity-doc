import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentDocuments } from '@/features/student-portal/student-documents';
import {
  getStudentDocuments,
  getStudentIssuedDocuments,
  getStudentSessionState,
  getStudentUploads,
} from '@/lib/server-auth';

export const metadata: Metadata = { title: 'My Documents' };

export default async function Page() {
  await connection();
  const [state, documents, issued, uploads] = await Promise.all([
    getStudentSessionState(),
    getStudentDocuments(),
    getStudentIssuedDocuments(),
    getStudentUploads(),
  ]);
  if (state.status !== 'authenticated') return null;
  return <StudentDocuments issued={issued} documents={documents} uploads={uploads} />;
}
