import type { Metadata } from 'next';
import { connection } from 'next/server';
import { StudentReExamPaymentPage } from '@/features/student-portal/student-re-exam-payment';
import { getStudentReExamPayment, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Pay the re-exam fee' };

export default async function Page({ params }: { params: Promise<{ applicationId: string }> }) {
  await connection();
  const { applicationId } = await params;
  const [state, view] = await Promise.all([
    getStudentSessionState(),
    getStudentReExamPayment(applicationId),
  ]);
  if (state.status !== 'authenticated') return null;
  return <StudentReExamPaymentPage view={view} />;
}
