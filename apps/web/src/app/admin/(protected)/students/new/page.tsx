import type { Metadata } from 'next';
import { StudentCreateView } from '@/features/students/student-create-view';

export const metadata: Metadata = { title: 'New student' };

export default function NewStudentPage() {
  return <StudentCreateView />;
}
