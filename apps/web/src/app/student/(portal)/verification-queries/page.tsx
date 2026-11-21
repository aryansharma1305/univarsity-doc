import type { Metadata } from 'next';
import { StudentVerificationQueries } from '@/features/communication/student-views';

export const metadata: Metadata = { title: 'Verification Queries' };

export default function Page() {
  return <StudentVerificationQueries />;
}
