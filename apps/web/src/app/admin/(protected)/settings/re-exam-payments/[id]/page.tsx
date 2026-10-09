import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { PaymentDestinationDetailView } from '@/features/re-exam-payments/destination-detail-view';

export const metadata: Metadata = { title: 'Re-exam payment details' };

export default async function PaymentDestinationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <PaymentDestinationDetailView destinationId={id} />
    </Suspense>
  );
}
