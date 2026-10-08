import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ProfileRequestDetailView } from '@/features/profile-requests/profile-request-detail-view';

export const metadata: Metadata = { title: 'Profile request' };

export default async function ProfileRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ProfileRequestDetailView requestId={id} />
    </Suspense>
  );
}
