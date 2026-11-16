import { listQuerySchema, optionalFilter, paginatedSchema } from '../academic/common.js';
import { certificateApplicationPolicySchema } from '../certificate-requests/schemas.js';
import { z } from 'zod';
import { publicVerificationServiceSchema } from './schemas.js';
const text = (n: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(n)
    .regex(/^[^\p{Cc}<>]+$/u);
export const approvedCertificateApplicationSchema = certificateApplicationPolicySchema
  .pick({
    certificateType: true,
    eligibilityReference: true,
    fields: true,
    evidence: true,
    fee: true,
    actions: true,
  })
  .extend({
    certificateType: z.enum(['PROVISIONAL', 'TRANSCRIPT', 'CHARACTER']),
    reviewAuthorityReference: text(200),
  })
  .strict();
export const verificationPolicyDefinitionSchema = z
  .object({
    usage: z.enum(['SYNTHETIC_ONLY', 'OFFICIAL']),
    application: approvedCertificateApplicationSchema.optional(),
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
  .regex(/^\d{1,5}(\.\d{1,2})?$/)
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

export const emptyOfficialCommandSchema = z.object({}).strict().default({});
export const officialActionReceiptSchema = z
  .object({
    id: z.uuid(),
    status: z.string().optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
export const verificationPolicyResponseSchema = z
  .object({
    id: z.uuid(),
    service: publicVerificationServiceSchema,
    programId: z.uuid(),
    definition: verificationPolicyDefinitionSchema,
    status: z.enum(['DRAFT', 'APPROVED', 'WITHDRAWN']),
    proposedById: z.uuid(),
    approvedById: z.uuid().nullable(),
    approvedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const officialDocumentUploadSchema = z
  .object({
    metadata: z.string().max(10000),
    file: z
      .file()
      .mime('application/pdf')
      .max(10 * 1024 * 1024),
  })
  .strict();
export const officialPolicyQuerySchema = listQuerySchema(['createdAt'], 'createdAt', {
  programId: optionalFilter(z.uuid()),
  service: optionalFilter(publicVerificationServiceSchema),
  status: optionalFilter(z.enum(['DRAFT', 'APPROVED', 'WITHDRAWN'])),
});
export const officialDocumentQuerySchema = listQuerySchema(['createdAt'], 'createdAt', {
  programId: optionalFilter(z.uuid()),
  documentType: optionalFilter(prepareOfficialDocumentSchema.shape.documentType),
  status: optionalFilter(
    z.enum([
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'ISSUED',
      'REVOKED',
      'CANCELLED',
      'SUPERSEDED',
    ]),
  ),
});
export const officialTemplateQuerySchema = listQuerySchema(['createdAt'], 'createdAt', {
  programId: optionalFilter(z.uuid()),
  documentType: optionalFilter(prepareOfficialDocumentSchema.shape.documentType),
  status: optionalFilter(z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])),
});
export const verificationAuditQuerySchema = listQuerySchema(['createdAt'], 'createdAt', {
  search: z.never().optional(),
  entityId: optionalFilter(z.uuid()),
});
export const officialPolicyListSchema = paginatedSchema(
  verificationPolicyResponseSchema.extend({ approvalAvailable: z.boolean() }),
);
export const officialStaffDocumentSchema = z.object({
  id: z.uuid(),
  certificateNumber: z.string().nullable(),
  documentType: z.string(),
  status: z.string(),
  registrationNumber: z.string(),
  program: z.string(),
  institution: z.string(),
  authorityReference: z.string(),
  issueDate: z.string().nullable(),
  generatedByUserId: z.uuid().nullable(),
});
export const officialStaffDocumentListSchema = paginatedSchema(officialStaffDocumentSchema);
export const officialTemplateListSchema = paginatedSchema(
  z.object({
    id: z.uuid(),
    name: z.string(),
    documentType: z.string(),
    version: z.number(),
    status: z.string(),
    programIds: z.array(z.uuid()),
    generatedByUserId: z.uuid().nullable(),
  }),
);
export const verificationAuditListSchema = paginatedSchema(
  z.object({
    id: z.uuid(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.uuid().nullable(),
    actor: z.string().nullable(),
    createdAt: z.iso.datetime(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  }),
);
