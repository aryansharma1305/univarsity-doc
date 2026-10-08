import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ProfileRequestsView } from '@/features/profile-requests/profile-requests-view';

export const metadata: Metadata = { title: 'Profile requests' };

export default function ProfileRequestsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ProfileRequestsView />
    </Suspense>
  );
}
