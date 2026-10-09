import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { DocumentDetailView } from '@/features/historical-documents/document-detail-view';

export const metadata: Metadata = { title: 'Historical document' };

export default async function HistoricalDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <DocumentDetailView documentId={id} />
    </Suspense>
  );
}
