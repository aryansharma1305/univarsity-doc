import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { StaffMessagesView } from '@/features/communication/staff-views';

export const metadata: Metadata = { title: 'Student messages' };

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <StaffMessagesView />
    </Suspense>
  );
}
