import {
  trainingCertificateInputSchema,
  trainingCertificateTemplateSchema,
  type TrainingCertificateTemplate,
} from '@docversity/validation';
const versionOne = trainingCertificateTemplateSchema.parse({
  id: 'sample-training',
  version: 1,
  type: 'TRAINING_CERTIFICATE',
  status: 'PREVIEW_ONLY',
  name: 'Certificate of Training · synthetic preview',
  config: {
    pageSize: 'A4',
    orientation: 'portrait',
    bodyIntroText: 'This is to certify that',
    organizerText:
      'Organized by Docversity University and conducted by Docversity India for six months from',
    trainingIncludesHeading: 'This training course includes',
    trainingTopicsText:
      'Principles of USG, Machine Knobology, Obstetrics & Gynaecology USG, Abdomen & Pelvis USG, Scrotum & Testis USG, Neck & Thyroid USG, Breast USG, Basics of Color Doppler USG',
    signatoryOneName: '',
    signatoryOneTitle: 'Sample academic signatory',
    signatoryTwoName: '',
    signatoryTwoTitle: 'Sample training signatory',
    verificationFooterText: 'SAMPLE QR · No public verification or official certificate issuance',
    brandingAsset: 'DOCVERSITY_REFERENCE_V1',
    crestAsset: 'DOCVERSITY_CREST_V1',
    sealAsset: 'DOCVERSITY_SEAL_V1',
  },
});
// Released definitions are immutable code snapshots; additions retain each prior version.
export function trainingCertificateTemplates(): TrainingCertificateTemplate[] {
  return [trainingCertificateTemplateSchema.parse(versionOne)];
}
export function trainingCertificateTemplate(
  id: string,
  version: number,
): TrainingCertificateTemplate {
  if (id !== versionOne.id || version !== versionOne.version)
    throw new Error('Unsupported preview template version.');
  return trainingCertificateTemplateSchema.parse(versionOne);
}
export const TRAINING_FIXTURES = [
  { id: 'standard', label: 'Standard training sample' },
  { id: 'long-text', label: 'Long name and course sample' },
] as const;
export function syntheticTrainingCertificate(fixture: 'standard' | 'long-text') {
  if (!TRAINING_FIXTURES.some((f) => f.id === fixture))
    throw new Error('Unsupported synthetic fixture.');
  return trainingCertificateInputSchema.parse({
    kind: 'SYNTHETIC_PREVIEW',
    registrationNumber: 'SAMPLE-TRAINING-0001',
    studentName: fixture === 'standard' ? 'Alex Sample' : 'Alexandra Morgan Sample-Example',
    courseName:
      fixture === 'standard'
        ? 'Diagnostic Sonography'
        : 'Advanced Diagnostic Sonography and Clinical Ultrasound Techniques',
    grade: 'A',
    coursePeriodText: 'September 2025 to March 2026',
    issueDate: '2026-04-09',
    qrCode: 'SYNTHETIC-TRAINING-PREVIEW',
    verificationUrl: 'https://example.invalid/docversity/sample-training',
    certificateReference: 'SAMPLE-TRAINING-V1',
  });
}
