import type { Metadata } from 'next';
import { ExamAppView } from '@/features/examinations/exam-app-view';

export const metadata: Metadata = { title: 'Examination application' };

export default function ExaminationApplicationPage() {
  return <ExamAppView />;
}
