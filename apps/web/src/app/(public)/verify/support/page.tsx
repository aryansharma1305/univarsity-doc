import type { Metadata } from 'next';
import { PublicVerificationQuery } from '@/features/communication/public-query';

export const metadata: Metadata = {
  title: 'Verification support',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function Page() {
  return <PublicVerificationQuery />;
}
