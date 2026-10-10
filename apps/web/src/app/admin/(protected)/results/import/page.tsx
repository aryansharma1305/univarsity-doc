import type { Metadata } from 'next';
import { NewResultPreviewView } from '@/features/result-imports/new-preview-view';
export const metadata: Metadata = { title: 'Results import' };
export default function ResultsImportPage() {
  return <NewResultPreviewView />;
}
