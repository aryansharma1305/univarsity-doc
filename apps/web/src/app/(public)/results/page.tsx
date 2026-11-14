import type { Metadata } from 'next';
import { VerificationScreen } from '@/features/public-verification/verification-screen';
export const metadata: Metadata = {
  title: 'Check Result',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <VerificationScreen service="result" />;
}
