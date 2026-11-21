import type { Metadata } from 'next';
import { StaffVerificationQueryView } from '@/features/communication/staff-views';

export const metadata: Metadata = { title: 'Verification query' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffVerificationQueryView queryId={id} />;
}
