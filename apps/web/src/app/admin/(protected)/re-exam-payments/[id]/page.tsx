import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ReExamPaymentDetailView } from '@/features/re-exam-payments/payment-detail-view';

export const metadata: Metadata = { title: 'Re-exam payment' };

export default async function ReExamPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ReExamPaymentDetailView paymentId={id} />
    </Suspense>
  );
}
