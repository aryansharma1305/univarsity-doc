import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ProgramDetailView } from '@/features/programs/program-detail-view';

export const metadata: Metadata = { title: 'Course' };

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ProgramDetailView programId={id} />
    </Suspense>
  );
}
