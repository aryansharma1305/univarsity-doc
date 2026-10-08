import type { Metadata } from 'next';
import { ComingSoon } from '@/components/public/coming-soon';

export const metadata: Metadata = { title: 'Check Results' };

export default function ResultsPage() {
  return (
    <ComingSoon
      title="Check Results"
      description="Published results will be searchable here once result management is built. No result lookup is available yet."
    />
  );
}
