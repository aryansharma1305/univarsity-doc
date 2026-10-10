import { ResultReviewDetailView } from '@/features/result-review/detail-view';
export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultReviewDetailView id={id} />;
}
