import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { StaffVerificationQueriesView } from '@/features/communication/staff-views';

export const metadata: Metadata = { title: 'Verification queries' };

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <StaffVerificationQueriesView />
    </Suspense>
  );
}
