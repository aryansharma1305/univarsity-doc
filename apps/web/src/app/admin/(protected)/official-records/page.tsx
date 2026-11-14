import { z } from 'zod';
import { OfficialRecords } from '@/features/official-records/view';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const parsed = z.uuid().safeParse(query.resultId),
    request = z.uuid().safeParse(query.requestId);
  return (
    <OfficialRecords
      initialResult={parsed.success ? parsed.data : ''}
      initialRequest={request.success ? request.data : ''}
    />
  );
}
