import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ProgramsView } from '@/features/programs/programs-view';

export const metadata: Metadata = { title: 'Programs' };

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ProgramsView />
    </Suspense>
  );
}
