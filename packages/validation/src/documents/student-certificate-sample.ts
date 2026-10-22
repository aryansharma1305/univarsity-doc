import { z } from 'zod';

/** A fixed synthetic asset, never an issued certificate or a caller-selected template. */
export const studentCertificateSampleIdSchema = z.literal('sample-training-v1');
export const studentCertificateSampleQuerySchema = z
  .object({
    disposition: z.enum(['inline', 'attachment']).default('inline'),
  })
  .strict();

/**
 * Phase 12C.1: fixed synthetic academic samples, one per certificate type. The certificate type is
 * derived from the identifier on the server, never supplied by the client. These IDs are served only
 * by the registration-scoped academic endpoint, and only for types approved for that course.
 */
export const ACADEMIC_SAMPLE_IDS = {
  COURSE_COMPLETION: 'sample-course-completion-v1',
  TRANSCRIPT: 'sample-transcript-v1',
  PROVISIONAL: 'sample-provisional-v1',
  CHARACTER: 'sample-character-v1',
  MIGRATION: 'sample-migration-v1',
} as const;
export type AcademicSampleCertificateType = keyof typeof ACADEMIC_SAMPLE_IDS;
export const academicCertificateSampleIdSchema = z.enum([
  ACADEMIC_SAMPLE_IDS.COURSE_COMPLETION,
  ACADEMIC_SAMPLE_IDS.TRANSCRIPT,
  ACADEMIC_SAMPLE_IDS.PROVISIONAL,
  ACADEMIC_SAMPLE_IDS.CHARACTER,
  ACADEMIC_SAMPLE_IDS.MIGRATION,
]);
export type AcademicCertificateSampleId = z.infer<typeof academicCertificateSampleIdSchema>;

export function academicSampleCertificateType(
  sampleId: AcademicCertificateSampleId,
): AcademicSampleCertificateType {
  const entry = Object.entries(ACADEMIC_SAMPLE_IDS).find(([, id]) => id === sampleId);
  if (!entry) throw new Error('Unknown academic sample.');
  return entry[0] as AcademicSampleCertificateType;
}

/** Same-origin URL of a registration-scoped academic sample (student portal). */
export function academicSampleFileUrl(
  registrationId: string,
  sampleId: AcademicCertificateSampleId,
  disposition: 'inline' | 'attachment',
): string {
  return `/api/v1/student/certificate-samples/registrations/${encodeURIComponent(registrationId)}/${sampleId}/file?disposition=${disposition}`;
}
