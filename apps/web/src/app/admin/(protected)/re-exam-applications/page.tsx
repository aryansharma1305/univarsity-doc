import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { ReExamApplicationsView } from '@/features/re-exams/applications-view';

export const metadata: Metadata = { title: 'Re-exam Applications' };

export default function ReExamApplicationsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ReExamApplicationsView />
    </Suspense>
  );
}
