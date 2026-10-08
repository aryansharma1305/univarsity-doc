import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ImportDetailView } from '@/features/imports/import-detail-view';

export const metadata: Metadata = { title: 'Student import' };

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ImportDetailView importId={id} />
    </Suspense>
  );
}
