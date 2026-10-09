import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { HistoricalDocumentsView } from '@/features/historical-documents/documents-view';

export const metadata: Metadata = { title: 'Historical Certificates' };

export default function HistoricalDocumentsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <HistoricalDocumentsView />
    </Suspense>
  );
}
