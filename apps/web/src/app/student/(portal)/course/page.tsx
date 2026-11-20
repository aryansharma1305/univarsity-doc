import { redirect } from 'next/navigation';

/** Course details now live in the Student Profile; old links keep working. */
export default function Page() {
  redirect('/student/profile#course-details');
}
