import type { Metadata } from 'next';
import { VerificationPanel } from '@/features/public-verification/verification-panel';

export const metadata: Metadata = { title: 'Verify Certificate' };

export default function VerificationPage() {
  return <VerificationPanel service="certificate" />;
}
