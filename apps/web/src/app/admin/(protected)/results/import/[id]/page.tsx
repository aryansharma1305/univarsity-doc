import type { Metadata } from 'next';
import { ResultPreviewView } from '@/features/result-imports/preview-view';
export const metadata: Metadata = { title: 'Results preview' };
export default async function ResultPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultPreviewView id={id} />;
}
