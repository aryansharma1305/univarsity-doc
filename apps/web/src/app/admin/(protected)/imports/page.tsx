import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ImportsView } from '@/features/imports/imports-view';

export const metadata: Metadata = { title: 'Imports' };

export default function ImportsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ImportsView />
    </Suspense>
  );
}
