import type { Metadata } from 'next';
import { StaffNotificationsView } from '@/features/communication/staff-views';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return <StaffNotificationsView />;
}
