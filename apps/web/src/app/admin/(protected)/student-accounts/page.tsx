import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { StudentAccountsView } from '@/features/student-accounts/student-accounts-view';

export const metadata: Metadata = { title: 'Student accounts' };

export default function StudentAccountsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <StudentAccountsView />
    </Suspense>
  );
}
