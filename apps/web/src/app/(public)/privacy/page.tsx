import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <ComingSoon
      title="Privacy"
      description="This content will be provided by the university before the portal goes live."
    />
  );
}
