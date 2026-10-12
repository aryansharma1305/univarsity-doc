import { z } from 'zod';
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}<>]+$/u);
export const trainingCertificateInputSchema = z
  .object({
    kind: z.literal('SYNTHETIC_PREVIEW'),
    registrationNumber: z.string().regex(/^SAMPLE-[A-Z0-9-]{1,40}$/),
    studentName: text(100),
    courseName: text(160),
    grade: text(12),
    coursePeriodText: text(100),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
    qrCode: z.literal('SYNTHETIC-TRAINING-PREVIEW'),
    verificationUrl: z.literal('https://example.invalid/docversity/sample-training'),
    certificateReference: z
      .string()
      .regex(/^SAMPLE-[A-Z0-9-]{1,40}$/)
      .optional(),
  })
  .strict();
export const trainingCertificateTemplateSchema = z
  .object({
    id: z.literal('sample-training'),
    version: z.literal(1),
    type: z.literal('TRAINING_CERTIFICATE'),
    status: z.literal('PREVIEW_ONLY'),
    name: text(80),
    config: z
      .object({
        pageSize: z.literal('A4'),
        orientation: z.literal('portrait'),
        bodyIntroText: text(140),
        organizerText: text(200),
        trainingIncludesHeading: text(100),
        trainingTopicsText: text(600),
        signatoryOneName: text(80).or(z.literal('')),
        signatoryOneTitle: text(80),
        signatoryTwoName: text(80).or(z.literal('')),
        signatoryTwoTitle: text(80),
        verificationFooterText: text(160),
        brandingAsset: z.literal('DOCVERSITY_REFERENCE_V1'),
        crestAsset: z.literal('DOCVERSITY_CREST_V1'),
        sealAsset: z.literal('DOCVERSITY_SEAL_V1'),
      })
      .strict(),
  })
  .strict();
export const trainingCertificatePreviewQuerySchema = z
  .object({
    templateId: z.literal('sample-training'),
    version: z.coerce.number().pipe(z.literal(1)),
    fixture: z.enum(['standard', 'long-text']),
    disposition: z.enum(['inline', 'attachment']).default('inline'),
  })
  .strict();
export const trainingCertificateTemplatesResponseSchema = z
  .object({
    templates: z.array(trainingCertificateTemplateSchema).max(10),
    fixtures: z
      .array(z.object({ id: z.enum(['standard', 'long-text']), label: text(80) }).strict())
      .max(2),
  })
  .strict();
export type TrainingCertificateInput = z.infer<typeof trainingCertificateInputSchema>;
export type TrainingCertificateTemplate = z.infer<typeof trainingCertificateTemplateSchema>;
export type TrainingCertificatePreviewQuery = z.infer<typeof trainingCertificatePreviewQuerySchema>;
