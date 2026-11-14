import { getStudentIssuedDocuments } from '@/lib/server-auth';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentDocuments } from '@/features/student-portal/student-documents';
import {
  getStudentCertificateEligibility,
  getStudentDocuments,
  getStudentSessionState,
} from '@/lib/server-auth';

export const metadata: Metadata = { title: 'My Documents' };

export default async function Page() {
  await connection();
  const [state, documents, eligibility, issued] = await Promise.all([
    getStudentSessionState(),
    getStudentDocuments(),
    getStudentCertificateEligibility(),
    getStudentIssuedDocuments(),
  ]);
  if (state.status !== 'authenticated') return null;
  return (
    <StudentDocuments
      issued={issued}
      documents={documents}
      courseSamples={eligibility ? eligibility.registrations : null}
    />
  );
}
