import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Admission Letter Verification' };

export default function AdmissionLetterVerificationPage() {
  return (
    <ComingSoon
      title="Admission Letter Verification"
      description="Public admission letter verification is not available yet. No admission record has been checked."
    />
  );
}
