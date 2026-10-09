import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ExaminationsView } from '@/features/examinations/examinations-view';

export const metadata: Metadata = { title: 'Examinations' };

export default function ExaminationsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ExaminationsView />
    </Suspense>
  );
}
