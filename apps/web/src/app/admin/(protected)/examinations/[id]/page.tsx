import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ExaminationDetailView } from '@/features/examinations/examination-detail-view';

export const metadata: Metadata = { title: 'Examination' };

export default async function ExaminationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ExaminationDetailView examinationId={id} />
    </Suspense>
  );
}
