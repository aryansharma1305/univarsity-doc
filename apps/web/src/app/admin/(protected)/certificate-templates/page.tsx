import { AcademicTemplatesPreview } from '@/features/certificate-templates/academic-preview-view';
import { CertificateTemplatesView } from '@/features/certificate-templates/preview-view';
export default function Page() {
  return (
    <>
      <CertificateTemplatesView />
      <AcademicTemplatesPreview />
    </>
  );
}
