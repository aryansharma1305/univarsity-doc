import type { Metadata } from 'next';
import { VerificationPanel } from '@/features/public-verification/verification-panel';

export const metadata: Metadata = {
  title: 'Check Result',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function VerificationPage() {
  return <VerificationPanel service="result" />;
}
