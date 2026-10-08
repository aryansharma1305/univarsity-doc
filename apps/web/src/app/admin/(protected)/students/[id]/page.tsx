import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { StudentDetailView } from '@/features/students/student-detail-view';

export const metadata: Metadata = { title: 'Student' };

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <StudentDetailView studentId={id} />
    </Suspense>
  );
}
