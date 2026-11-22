import type { Metadata } from 'next';
import { StudentThread } from '@/features/communication/student-views';

export const metadata: Metadata = { title: 'Conversation' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentThread threadId={id} />;
}
