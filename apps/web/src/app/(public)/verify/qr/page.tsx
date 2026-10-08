import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Scan QR' };

export default function QrVerificationPage() {
  return (
    <ComingSoon
      title="Scan QR"
      description="QR verification is not available yet. Documents issued by the new system will carry a QR code that opens their verification page."
    />
  );
}
