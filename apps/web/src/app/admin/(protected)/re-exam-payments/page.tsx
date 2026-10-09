import type { Metadata } from 'next';
import { ReExamPaymentsView } from '@/features/re-exam-payments/payments-view';

export const metadata: Metadata = { title: 'Re-exam payments' };

export default function ReExamPaymentsPage() {
  return <ReExamPaymentsView />;
}
