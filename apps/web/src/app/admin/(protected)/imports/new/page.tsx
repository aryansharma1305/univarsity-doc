import type { Metadata } from 'next';
import { NewImportView } from '@/features/imports/new-import-view';

export const metadata: Metadata = { title: 'Import students' };

export default function NewImportPage() {
  return <NewImportView />;
}
