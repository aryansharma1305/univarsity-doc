import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <ComingSoon
      title="Contact"
      description="This content will be provided by the university before the portal goes live."
    />
  );
}
