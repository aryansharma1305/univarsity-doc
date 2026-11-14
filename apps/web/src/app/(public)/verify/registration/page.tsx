import type { Metadata } from 'next';
import { VerificationScreen } from '@/features/public-verification/verification-screen';
export const metadata: Metadata = {
  title: 'Verify Registration',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <VerificationScreen service="registration" />;
}
