import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Certificate Verification' };

export default function CertificateVerificationPage() {
  return (
    <ComingSoon
      title="Certificate Verification"
      description="Certificate verification is not available yet. It will be added together with certificate issuance."
    />
  );
}
