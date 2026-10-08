import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Help' };

export default function HelpPage() {
  return (
    <ComingSoon
      title="Help"
      description="This content will be provided by the university before the portal goes live."
    />
  );
}
