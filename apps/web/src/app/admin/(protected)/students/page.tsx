import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { StudentsView } from '@/features/students/students-view';

export const metadata: Metadata = { title: 'Students' };

export default function StudentsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <StudentsView />
    </Suspense>
  );
}
