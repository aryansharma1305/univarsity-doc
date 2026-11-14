import type { Metadata } from 'next';
import { VerificationPanel } from '@/features/public-verification/verification-panel';

export const metadata: Metadata = { title: 'Verify Registration' };

export default function VerificationPage() {
  return <VerificationPanel service="registration" />;
}
