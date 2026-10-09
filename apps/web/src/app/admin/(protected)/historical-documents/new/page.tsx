import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { UploadDocumentView } from '@/features/historical-documents/upload-view';

export const metadata: Metadata = { title: 'Upload historical document' };

export default function UploadHistoricalDocumentPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <UploadDocumentView />
    </Suspense>
  );
}
