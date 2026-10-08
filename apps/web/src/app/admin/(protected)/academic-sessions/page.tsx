import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { SessionsView } from '@/features/academic-sessions/sessions-view';

export const metadata: Metadata = { title: 'Academic Sessions' };

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SessionsView />
    </Suspense>
  );
}
