import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TableSkeleton } from '@/components/data/states';
import { CurriculumEditorView } from '@/features/curricula/curriculum-editor-view';

export const metadata: Metadata = { title: 'Curriculum' };

export default async function CurriculumPage({
  params,
}: {
  params: Promise<{ id: string; curriculumId: string }>;
}) {
  const { id, curriculumId } = await params;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CurriculumEditorView programId={id} curriculumId={curriculumId} />
    </Suspense>
  );
}
