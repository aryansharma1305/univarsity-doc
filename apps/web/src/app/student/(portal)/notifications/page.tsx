import type { Metadata } from 'next';
import { StudentUnavailable } from '@/features/student-portal/student-pages';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return <StudentUnavailable module="notifications" />;
}
