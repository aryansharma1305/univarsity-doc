import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ReExamApplicationDetailView } from '@/features/re-exams/application-detail-view';

export const metadata: Metadata = { title: 'Re-exam application' };

export default async function ReExamApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ReExamApplicationDetailView applicationId={id} />
    </Suspense>
  );
}
