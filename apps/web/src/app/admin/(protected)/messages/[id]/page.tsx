import type { Metadata } from 'next';
import { StaffThreadView } from '@/features/communication/staff-views';

export const metadata: Metadata = { title: 'Conversation' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffThreadView threadId={id} />;
}
