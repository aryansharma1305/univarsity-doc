import type { Metadata } from 'next';
import { StudentMessages } from '@/features/communication/student-views';

export const metadata: Metadata = { title: 'Messages' };

export default function Page() {
  return <StudentMessages />;
}
