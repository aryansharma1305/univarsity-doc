import type { Metadata } from 'next';
import { StudentNotifications } from '@/features/communication/student-views';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return <StudentNotifications />;
}
