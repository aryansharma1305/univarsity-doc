import { z } from 'zod';
import {
  activityItemSchema,
  atLeastOneField,
  listQuerySchema,
  optionalDateSchema,
  optionalFilter,
  optionalText,
  paginatedSchema,
  refSchema,
} from '../academic/common.js';

/**
 * Historical documents (Phase 8): certificates, marksheets and similar documents issued in the
 * past (on paper or by the legacy system), uploaded by authorised staff as EVIDENCE and shown to the
 * student once published. They are not Docversity-issued credentials, and visibility to the student
 * says nothing about authenticity — that is a separate, explicit staff review.
 */

export const HISTORICAL_DOCUMENT_TYPES = [
  'DEGREE_CERTIFICATE',
  'DIPLOMA_CERTIFICATE',
  'PROVISIONAL_CERTIFICATE',
  'MARKSHEET',
  'TRANSCRIPT',
  'MIGRATION_CERTIFICATE',
  'CHARACTER_CERTIFICATE',
  'OTHER',
] as const;
export const historicalDocumentTypeSchema = z.enum(HISTORICAL_DOCUMENT_TYPES);

export const HISTORICAL_DOCUMENT_TYPE_LABELS: Record<HistoricalDocumentType, string> = {
  DEGREE_CERTIFICATE: 'Degree certificate',
  DIPLOMA_CERTIFICATE: 'Diploma certificate',
  PROVISIONAL_CERTIFICATE: 'Provisional certificate',
  MARKSHEET: 'Marksheet',
  TRANSCRIPT: 'Transcript',
  MIGRATION_CERTIFICATE: 'Migration certificate',
  CHARACTER_CERTIFICATE: 'Character certificate',
  OTHER: 'Other document',
};

export const HISTORICAL_DOCUMENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'WITHDRAWN',
  'SUPERSEDED',
] as const;
export const historicalDocumentStatusSchema = z.enum(HISTORICAL_DOCUMENT_STATUSES);

export const DOCUMENT_AUTHENTICITY = [
  'UNVERIFIED',
  'CONFIRMED_AGAINST_RECORDS',
  'DISPUTED',
] as const;
export const documentAuthenticitySchema = z.enum(DOCUMENT_AUTHENTICITY);

/** Plain-language authenticity wording. Nothing here claims cryptographic verification. */
export const AUTHENTICITY_LABELS: Record<DocumentAuthenticity, string> = {
  UNVERIFIED: 'Not independently verified',
  CONFIRMED_AGAINST_RECORDS: 'Confirmed against university records',
  DISPUTED: 'Under dispute',
};

export const DOCUMENT_PROVENANCES = [
  'UNIVERSITY_ARCHIVE',
  'LEGACY_WORDPRESS',
  'STUDENT_PROVIDED_COPY',
  'OTHER',
] as const;
export const documentProvenanceSchema = z.enum(DOCUMENT_PROVENANCES);

export const PROVENANCE_LABELS: Record<DocumentProvenance, string> = {
  UNIVERSITY_ARCHIVE: 'University archive',
  LEGACY_WORDPRESS: 'Legacy WordPress system',
  STUDENT_PROVIDED_COPY: 'Copy provided by the student (collected by staff)',
  OTHER: 'Other source',
};

/** Server-enforced upload rules (content is checked, not the declared type or file name). */
export const HISTORICAL_DOCUMENT_RULES = {
  maxBytes: 15 * 1024 * 1024,
  acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  /** Decoder budget for scanned images (≈ A3 at 600 dpi). */
  maxImagePixels: 100_000_000,
  minImageSide: 300,
} as const;

const certificateNumberSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(64, 'Use at most 64 characters.')
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} ./_\-:#]*$/u, 'Enter the number exactly as printed.')
    .nullable()
    .optional(),
);

const legacyUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .url({ protocol: /^https?$/, error: 'Enter the full http(s) address printed on the original.' })
    .max(512, 'Use at most 512 characters.')
    .nullable()
    .optional(),
);

const metadataFields = {
  documentType: historicalDocumentTypeSchema,
  title: z.string().trim().min(1, 'Enter a title.').max(200, 'Use at most 200 characters.'),
  certificateNumber: certificateNumberSchema,
  issuedOn: optionalDateSchema,
  provenance: documentProvenanceSchema,
  provenanceNote: optionalText(1000),
  legacySourceSystem: optionalText(32),
  legacyRecordId: optionalText(128),
  legacyVerificationUrl: legacyUrlSchema,
};

/** Multipart text fields of an upload (the file is the `file` part). */
export const uploadHistoricalDocumentSchema = z
  .object({
    studentRegistrationId: z.uuid({ error: 'Choose the registration.' }),
    ...metadataFields,
  })
  .strict()
  .meta({ id: 'UploadHistoricalDocument' });

/** Multipart text fields of a replacement: registration is inherited; metadata may be corrected. */
export const replaceHistoricalDocumentSchema = z
  .object(metadataFields)
  .partial()
  .strict()
  .meta({ id: 'ReplaceHistoricalDocument' });

/** DRAFT only. */
export const updateHistoricalDocumentSchema = atLeastOneField(
  z.object(metadataFields).partial().strict(),
).meta({ id: 'UpdateHistoricalDocument' });

export const withdrawHistoricalDocumentSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Explain why the document is withdrawn (at least 5 characters).')
      .max(1000, 'Use at most 1000 characters.'),
  })
  .strict()
  .meta({ id: 'WithdrawHistoricalDocument' });

export const reviewAuthenticitySchema = z
  .object({
    authenticity: z.enum(['CONFIRMED_AGAINST_RECORDS', 'DISPUTED']),
    note: z
      .string()
      .trim()
      .min(5, 'Describe what was checked (at least 5 characters).')
      .max(1000, 'Use at most 1000 characters.'),
  })
  .strict()
  .meta({ id: 'ReviewDocumentAuthenticity' });

export const documentDispositionSchema = z.enum(['inline', 'attachment']).default('attachment');

const fileInfoSchema = z.object({
  contentType: z.enum(HISTORICAL_DOCUMENT_RULES.acceptedTypes),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  originalFilename: z.string(),
});

const personSchema = z.object({ id: z.uuid(), displayName: z.string() }).nullable();

export const historicalDocumentRowSchema = z
  .object({
    id: z.uuid(),
    documentType: historicalDocumentTypeSchema,
    title: z.string(),
    certificateNumber: z.string().nullable(),
    issuedOn: z.iso.date().nullable(),
    status: historicalDocumentStatusSchema,
    authenticity: documentAuthenticitySchema,
    student: z.object({ id: z.uuid(), fullName: z.string() }),
    registration: z.object({ id: z.uuid(), registrationNumber: z.string(), program: refSchema }),
    file: fileInfoSchema,
    uploadedBy: personSchema,
    createdAt: z.iso.datetime(),
    publishedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'HistoricalDocumentRow' });

export const historicalDocumentListSchema = paginatedSchema(historicalDocumentRowSchema).meta({
  id: 'HistoricalDocumentList',
});

export const HISTORICAL_DOCUMENT_SORT_FIELDS = ['createdAt', 'issuedOn'] as const;
export const historicalDocumentQuerySchema = listQuerySchema(
  HISTORICAL_DOCUMENT_SORT_FIELDS,
  'createdAt',
  {
    status: optionalFilter(historicalDocumentStatusSchema),
    documentType: optionalFilter(historicalDocumentTypeSchema),
    authenticity: optionalFilter(documentAuthenticitySchema),
    studentRegistrationId: optionalFilter(z.uuid()),
  },
);

const linkSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: historicalDocumentStatusSchema,
  createdAt: z.iso.datetime(),
});

export const historicalDocumentDetailSchema = historicalDocumentRowSchema
  .extend({
    provenance: documentProvenanceSchema,
    provenanceNote: z.string().nullable(),
    legacySourceSystem: z.string().nullable(),
    legacyRecordId: z.string().nullable(),
    legacyVerificationUrl: z.string().nullable(),
    publishedBy: personSchema,
    withdrawnAt: z.iso.datetime().nullable(),
    withdrawnBy: personSchema,
    withdrawalReason: z.string().nullable(),
    supersededAt: z.iso.datetime().nullable(),
    authenticityNote: z.string().nullable(),
    authenticityReviewedAt: z.iso.datetime().nullable(),
    authenticityReviewedBy: personSchema,
    replaces: linkSchema.nullable(),
    replacedBy: linkSchema.nullable(),
    /** Other documents with the same certificate number (possible duplicates or misfiling). */
    sameNumberElsewhere: z.array(
      z.object({
        id: z.uuid(),
        registrationNumber: z.string(),
        status: historicalDocumentStatusSchema,
      }),
    ),
    history: z.array(activityItemSchema),
  })
  .meta({ id: 'HistoricalDocumentDetail' });

/** What a student sees about one of their own PUBLISHED documents (no staff identities or keys). */
export const studentDocumentSchema = z
  .object({
    id: z.uuid(),
    documentType: historicalDocumentTypeSchema,
    title: z.string(),
    certificateNumber: z.string().nullable(),
    issuedOn: z.iso.date().nullable(),
    registrationNumber: z.string(),
    program: refSchema,
    contentType: z.enum(HISTORICAL_DOCUMENT_RULES.acceptedTypes),
    sizeBytes: z.number().int(),
    publishedAt: z.iso.datetime(),
    authenticity: documentAuthenticitySchema,
    authenticityReviewedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'StudentDocument' });

export const studentDocumentListSchema = z
  .object({ data: z.array(studentDocumentSchema) })
  .meta({ id: 'StudentDocumentList' });

export type HistoricalDocumentType = z.infer<typeof historicalDocumentTypeSchema>;
export type HistoricalDocumentStatus = z.infer<typeof historicalDocumentStatusSchema>;
export type DocumentAuthenticity = z.infer<typeof documentAuthenticitySchema>;
export type DocumentProvenance = z.infer<typeof documentProvenanceSchema>;
export type UploadHistoricalDocument = z.infer<typeof uploadHistoricalDocumentSchema>;
export type UploadHistoricalDocumentInput = z.input<typeof uploadHistoricalDocumentSchema>;
export type ReplaceHistoricalDocument = z.infer<typeof replaceHistoricalDocumentSchema>;
export type UpdateHistoricalDocument = z.infer<typeof updateHistoricalDocumentSchema>;
export type UpdateHistoricalDocumentInput = z.input<typeof updateHistoricalDocumentSchema>;
export type WithdrawHistoricalDocument = z.infer<typeof withdrawHistoricalDocumentSchema>;
export type ReviewAuthenticity = z.infer<typeof reviewAuthenticitySchema>;
export type DocumentDisposition = z.infer<typeof documentDispositionSchema>;
export type HistoricalDocumentRow = z.infer<typeof historicalDocumentRowSchema>;
export type HistoricalDocumentList = z.infer<typeof historicalDocumentListSchema>;
export type HistoricalDocumentQuery = z.infer<typeof historicalDocumentQuerySchema>;
export type HistoricalDocumentDetail = z.infer<typeof historicalDocumentDetailSchema>;
export type StudentDocument = z.infer<typeof studentDocumentSchema>;
export type StudentDocumentList = z.infer<typeof studentDocumentListSchema>;
