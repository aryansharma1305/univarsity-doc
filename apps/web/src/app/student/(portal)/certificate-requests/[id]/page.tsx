import { CertificateRequestDetailView } from '@/features/certificate-requests/views';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CertificateRequestDetailView id={id} student />;
}
