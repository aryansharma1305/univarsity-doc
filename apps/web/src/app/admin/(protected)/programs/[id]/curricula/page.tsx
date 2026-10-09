import { redirect } from 'next/navigation';

/** Curriculum versions are listed on the course page. */
export default async function CurriculaIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/programs/${id}`);
}
