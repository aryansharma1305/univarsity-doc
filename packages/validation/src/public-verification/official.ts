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
    certificateType: z.enum(['PROVISIONAL', 'TRANSCRIPT', 'CHARACTER', 'MIGRATION']),
    reviewAuthorityReference: text(200),
  })
  .strict();
/**
 * Anonymous (no sign-in) disclosure, per service. Only fields listed here can ever be returned to an
 * anonymous visitor, and only those a policy explicitly lists. Photos, dates of birth, identity
 * numbers, contact details and uploads are deliberately absent: they cannot be enabled by policy.
 */
export const PUBLIC_DISCLOSURE_FIELDS = {
  registration: [
    'STUDENT_NAME',
    'REGISTRATION_NUMBER',
    'REGISTRATION_DATE',
    'PROGRAM',
    'COURSE_LEVEL',
    'COURSE_DURATION',
    'SCHOOL',
    'ACADEMIC_SESSION',
    'ADMISSION_DATE',
    'COMPLETION_DATE',
  ],
  'admission-letter': [
    'STUDENT_NAME',
    'REGISTRATION_NUMBER',
    'PROGRAM',
    'COURSE_LEVEL',
    'COURSE_DURATION',
    'SCHOOL',
    'ISSUE_DATE',
  ],
  certificate: [
    'STUDENT_NAME',
    'REGISTRATION_NUMBER',
    'PROGRAM',
    'COURSE_LEVEL',
    'COURSE_DURATION',
    'SCHOOL',
    'ISSUE_DATE',
    'CERTIFICATE_TYPE',
  ],
  result: ['PROGRAM', 'ACADEMIC_SESSION', 'RESULT_OUTCOME'],
} as const satisfies Record<z.infer<typeof publicVerificationServiceSchema>, readonly string[]>;
export const publicDisclosureFieldSchema = z.enum([
  ...new Set(Object.values(PUBLIC_DISCLOSURE_FIELDS).flat()),
] as [string, ...string[]]);
export type PublicDisclosureField = z.infer<typeof publicDisclosureFieldSchema>;
export const PUBLIC_DISCLOSURE_FIELD_LABELS: Record<string, string> = {
  STUDENT_NAME: 'Student name',
  REGISTRATION_NUMBER: 'Registration number',
  REGISTRATION_DATE: 'Registration date',
  PROGRAM: 'Course name',
  COURSE_LEVEL: 'Course level',
  COURSE_DURATION: 'Course duration',
  SCHOOL: 'School / department name',
  ACADEMIC_SESSION: 'Academic session',
  ADMISSION_DATE: 'Admission date',
  COMPLETION_DATE: 'Course completion date',
  ISSUE_DATE: 'Issue date',
  CERTIFICATE_TYPE: 'Certificate type',
  RESULT_OUTCOME: 'Result outcome (e.g. PASS)',
};
/** What the credential-gated option opens, per service (never by number alone). */
export const PUBLIC_CREDENTIAL_ACCESS_LABELS: Record<string, string | null> = {
  registration: null,
  'admission-letter': 'The issued admission letter PDF, to holders of its QR code',
  certificate: 'The issued certificate PDF, to holders of its QR code',
  result: 'The full marksheet (subjects and marks), to holders of its QR code',
};
export const publicDisclosureSchema = z
  .object({
    /** The university authorises lookups without a student session for this service and course. */
    anonymousLookup: z.literal(true),
    fields: z.array(publicDisclosureFieldSchema).max(20),
    /**
     * Certificates/admission letters: the issued PDF to a holder of the document's QR token.
     * Results: the full marksheet to a holder of the publication's QR token. Never by number alone.
     */
    documentWithCredential: z.boolean(),
  })
  .strict();
export type PublicDisclosure = z.infer<typeof publicDisclosureSchema>;

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
    /** Absent = no anonymous lookup (the signed-in owner and QR paths are unchanged). */
    publicDisclosure: publicDisclosureSchema.optional(),
  })
  .strict();
export type VerificationPolicyDefinition = z.infer<typeof verificationPolicyDefinitionSchema>;
export const proposeVerificationPolicySchema = z
  .object({
    service: publicVerificationServiceSchema,
    programId: z.uuid(),
    definition: verificationPolicyDefinitionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed: readonly string[] = PUBLIC_DISCLOSURE_FIELDS[value.service];
    for (const field of value.definition.publicDisclosure?.fields ?? [])
      if (!allowed.includes(field))
        ctx.addIssue({
          code: 'custom',
          path: ['definition', 'publicDisclosure', 'fields'],
          message: `${field} cannot be disclosed for ${value.service}.`,
        });
  });
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
    /** Owning student only: the marksheet's QR verification link (credential in the fragment). */
    verificationUrl: z.url().optional(),
  })
  .strict();
export const publicVerificationDetailsSchema = z
  .object({
    studentName: z.string(),
    registrationNumber: z.string(),
    registrationDate: z.iso.date(),
    program: z.string(),
    courseLevel: z.string(),
    courseDuration: z.string(),
    school: z.string(),
    academicSession: z.string(),
    admissionDate: z.iso.date(),
    completionDate: z.iso.date(),
    issueDate: z.iso.date(),
    certificateType: z.string(),
    rollNumber: z.string(),
    period: z
      .object({ structure: z.enum(['SEMESTER', 'YEAR']), number: z.number().int() })
      .strict(),
    examination: z.string(),
    outcome: z.string(),
  })
  .partial()
  .strict();
export type PublicVerificationDetails = z.infer<typeof publicVerificationDetailsSchema>;

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
    /** Anonymous lookups: only the fields the course's approved policy lists. */
    details: publicVerificationDetailsSchema.optional(),
    /** Registration status as recorded (ACTIVE, COMPLETED, SUSPENDED or REVOKED). */
    recordStatus: z.enum(['ACTIVE', 'COMPLETED', 'SUSPENDED', 'REVOKED']).optional(),
    /** The document PDF / full marksheet is available to this request's QR credential. */
    documentAccess: z.boolean().optional(),
  })
  .strict();
export const prepareOfficialDocumentSchema = z
  .object({
    registrationId: z.uuid(),
    policyId: z.uuid(),
    templateId: z.uuid(),
    documentType: z.enum([
      'ADMISSION_LETTER',
      'PROVISIONAL',
      'TRANSCRIPT',
      'CHARACTER',
      'MIGRATION',
    ]),
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
    /** Admission letters only: the server generates the PDF from records instead of an upload. */
    generate: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => !v.generate || v.documentType === 'ADMISSION_LETTER', {
    path: ['generate'],
    message: 'Only admission letters can be generated.',
  });
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
    /**
     * Where the stored PDF came from. GENERATED letters carry no signature or seal; the university
     * signs the printed copy. Absent on documents prepared before this was recorded.
     */
    pdfSource: z.enum(['GENERATED', 'UPLOADED']).optional(),
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
    /** The owner's own QR verification link (credential in the fragment). */
    verificationUrl: z.url().optional(),
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
  pdfSource: z.enum(['GENERATED', 'UPLOADED']).nullable(),
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

/** Anonymous result search: course + roll number + semester/year. Reveals a status, never marks. */
export const publicResultSearchSchema = z
  .object({
    contractVersion: z.literal(2),
    programId: z.uuid(),
    rollNumber: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
    periodNumber: z.number().int().min(1).max(24),
  })
  .strict();
export type PublicResultSearch = z.infer<typeof publicResultSearchSchema>;

/** A QR credential (43-char random token) sent in the body — never in a URL query string. */
export const publicCredentialSchema = z
  .object({
    contractVersion: z.literal(2),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export type PublicCredential = z.infer<typeof publicCredentialSchema>;
export const publicDocumentRequestSchema = publicCredentialSchema
  .extend({ service: z.enum(['certificate', 'admission-letter']) })
  .strict();
export type PublicDocumentRequest = z.infer<typeof publicDocumentRequestSchema>;

/** Courses whose approved result policy allows anonymous search, with their real period structure. */
export const publicResultOptionsSchema = z
  .object({
    programs: z.array(
      z
        .object({
          id: z.uuid(),
          name: z.string(),
          structure: z.enum(['SEMESTER', 'YEAR']),
          periods: z.array(z.number().int().min(1)),
        })
        .strict(),
    ),
  })
  .strict();
export type PublicResultOptions = z.infer<typeof publicResultOptionsSchema>;
