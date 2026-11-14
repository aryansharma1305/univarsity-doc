import { z } from 'zod';
import { publicVerificationServiceSchema } from './schemas.js';
const text = (n: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(n)
    .regex(/^[^\p{Cc}<>]+$/u);
export const verificationPolicyDefinitionSchema = z
  .object({
    usage: z.enum(['SYNTHETIC_ONLY', 'OFFICIAL']),
    institutionName: text(200),
    authorizationReference: text(200),
    discloseProgram: z.boolean(),
    discloseIssueDate: z.boolean(),
    // Registration and results use the existing student session, never DOB or a number alone.
    identityFactor: z.literal('AUTHENTICATED_OWNER'),
    resultMode: z.literal('REVIEWED_VALUES_ONLY'),
  })
  .strict();
export const proposeVerificationPolicySchema = z
  .object({
    service: publicVerificationServiceSchema,
    programId: z.uuid(),
    definition: verificationPolicyDefinitionSchema,
  })
  .strict();
export const officialVerificationRequestSchema = z
  .object({
    contractVersion: z.literal(2),
    reference: z
      .string()
      .trim()
      .min(3)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
      .optional(),
    token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    periodNumber: z.number().int().min(1).max(24).optional(),
    examinationId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => (v.reference !== undefined) !== (v.token !== undefined));
export const officialSubjectSchema = z
  .object({
    programSubjectId: z.uuid(),
    code: z.string(),
    name: z.string(),
    internalMarks: z.string().nullable(),
    externalMarks: z.string().nullable(),
    practicalMarks: z.string().nullable(),
    otherMarks: z.string().nullable(),
    totalMarks: z.string().nullable(),
    maxMarks: z.string().nullable(),
    grade: z.string().nullable(),
    status: z.string(),
  })
  .strict();
export const officialPublishedResultSchema = z
  .object({
    id: z.uuid(),
    usage: z.literal('OFFICIAL'),
    label: z.literal('Official published result'),
    examination: z.string(),
    examinationId: z.uuid(),
    periodNumber: z.number(),
    attemptNumber: z.number(),
    publishedAt: z.iso.datetime(),
    sgpa: z.string().nullable(),
    outcome: z.string().nullable(),
    subjects: z.array(officialSubjectSchema),
  })
  .strict();
export const officialVerificationResponseSchema = z
  .object({
    contractVersion: z.literal(2),
    service: publicVerificationServiceSchema,
    status: z.enum([
      'VALID',
      'ISSUED',
      'ACTIVE',
      'INACTIVE',
      'REVOKED',
      'INVALID',
      'NOT_FOUND',
      'UNPUBLISHED',
      'UNAVAILABLE',
      'AUTHENTICATION_REQUIRED',
    ]),
    message: z.string().max(300),
    documentType: z.string().optional(),
    institution: z.string().optional(),
    program: z.string().optional(),
    issueDate: z.string().optional(),
    maskedReference: z.string().optional(),
    results: z.array(officialPublishedResultSchema).max(100).optional(),
  })
  .strict();
export const prepareOfficialDocumentSchema = z
  .object({
    registrationId: z.uuid(),
    policyId: z.uuid(),
    templateId: z.uuid(),
    documentType: z.enum(['ADMISSION_LETTER', 'PROVISIONAL', 'TRANSCRIPT', 'CHARACTER']),
    requestId: z.uuid().optional(),
    certificateNumber: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
      .refine((v) => !/sample|synthetic|draft/i.test(v)),
    issueDate: z.iso.date(),
    authorityReference: text(200),
  })
  .strict();
export const officialDocumentSnapshotSchema = z
  .object({
    usage: z.literal('OFFICIAL'),
    policyId: z.uuid(),
    templateId: z.uuid(),
    registrationId: z.uuid(),
    institutionName: text(200),
    programName: text(200),
    authorityReference: text(200),
    requestId: z.uuid().nullable(),
    requestVersion: z.number().int().positive().nullable(),
  })
  .strict();
export const officialDocumentCommandSchema = z.object({ reason: text(500).optional() }).strict();
export const officialDocumentReceiptSchema = z
  .object({
    id: z.uuid(),
    status: z.string(),
    certificateNumber: z.string().nullable(),
    verificationUrl: z.url().optional(),
  })
  .strict();
export const publishOfficialResultSchema = z
  .object({ policyId: z.uuid(), expectedVersion: z.number().int().positive() })
  .strict();
export type OfficialVerificationRequest = z.infer<typeof officialVerificationRequestSchema>;
export type OfficialVerificationResponse = z.infer<typeof officialVerificationResponseSchema>;
export type PrepareOfficialDocument = z.infer<typeof prepareOfficialDocumentSchema>;
const markValue = z
  .string()
  .regex(/^\d{1,5}(\.\d{1,3})?$/)
  .nullable();
export const attestOfficialResultSchema = z
  .object({
    policyId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    authorityReference: text(200),
    outcome: z.enum(['PASS', 'FAIL', 'BACKLOG', 'WITHHELD']),
    totalMarks: markValue,
    maxMarks: markValue,
    sgpa: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,3})?$/)
      .nullable(),
    cgpa: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,3})?$/)
      .nullable(),
    subjects: z
      .array(
        z
          .object({
            id: z.uuid(),
            status: z.enum(['PASS', 'FAIL', 'ABSENT', 'BACKLOG', 'WITHHELD']),
            grade: z.string().trim().min(1).max(8).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export const verificationPolicyRecordSchema = z.object({
  id: z.uuid(),
  service: z.string(),
  programId: z.uuid(),
  definition: verificationPolicyDefinitionSchema,
  status: z.string(),
  proposedById: z.uuid(),
  approvedById: z.uuid().nullable(),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
});
export const officialDocumentListSchema = z.array(
  z.object({
    id: z.uuid(),
    status: z.string(),
    certificateNumber: z.string().nullable(),
    documentType: z.string(),
    studentRegistrationId: z.uuid(),
  }),
);
export const prepareOfficialTemplateSchema = z
  .object({
    policyId: z.uuid(),
    programId: z.uuid(),
    documentType: prepareOfficialDocumentSchema.shape.documentType,
    name: text(120),
  })
  .strict();
export const studentIssuedDocumentsSchema = z.array(
  z.object({
    id: z.uuid(),
    documentType: z.string(),
    certificateNumber: z.string(),
    issueDate: z.string(),
  }),
);
