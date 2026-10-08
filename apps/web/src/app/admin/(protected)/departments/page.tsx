import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { DepartmentsView } from '@/features/departments/departments-view';

export const metadata: Metadata = { title: 'Departments' };

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <DepartmentsView />
    </Suspense>
  );
}
