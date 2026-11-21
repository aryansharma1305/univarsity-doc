import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { StudentCertificateEligibility } from '@/features/certificate-eligibility/student-panel';
import { StudentCertificateSamples } from '@/features/student-portal/certificate-samples';
import { PageIntro } from '@/features/student-portal/portal-ui';
import { getStudentCertificateEligibility, getStudentSessionState } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Certificate samples' };

export default async function Page() {
  await connection();
  const [state, eligibility] = await Promise.all([
    getStudentSessionState(),
    getStudentCertificateEligibility(),
  ]);
  if (state.status !== 'authenticated') return null;
  return (
    <>
      <Link
        href="/student/certificate-requests"
        className="mb-4 inline-flex min-h-11 items-center text-sm text-brand underline underline-offset-4"
      >
        Back to Certificate Request
      </Link>
      <PageIntro title="Certificate samples" />
      <StudentCertificateSamples courseSamples={eligibility ? eligibility.registrations : null} />
      <StudentCertificateEligibility />
    </>
  );
}
