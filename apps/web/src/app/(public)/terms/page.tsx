import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <ComingSoon
      title="Terms"
      description="This content will be provided by the university before the portal goes live."
    />
  );
}
