import { DraftEditorView } from '@/features/draft-results/editor-view';
export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DraftEditorView id={id} />;
}
