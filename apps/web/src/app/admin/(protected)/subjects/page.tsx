import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { SubjectsView } from '@/features/subjects/subjects-view';

export const metadata: Metadata = { title: 'Subject Catalogue' };

export default function SubjectsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SubjectsView />
    </Suspense>
  );
}
