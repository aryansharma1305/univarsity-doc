import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Registration Verification' };

export default function RegistrationVerificationPage() {
  return (
    <ComingSoon
      title="Registration Verification"
      description="Public registration verification is not available yet. It will be added in a later phase."
    />
  );
}
