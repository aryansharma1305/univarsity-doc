import type { Metadata } from 'next';
import { FeeRulesView } from '@/features/re-exams/fee-rules-view';

export const metadata: Metadata = { title: 'Re-exam fee rules' };

export default function ReExamFeesPage() {
  return <FeeRulesView />;
}
