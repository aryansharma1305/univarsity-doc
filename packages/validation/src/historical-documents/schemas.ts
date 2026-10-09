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

/**
 * The searchable form of a certificate number, used for search and duplicate warnings only — never
 * shown or stored in place of the number as printed. Unicode NFKC (folds full-width and other
 * compatibility forms), upper-cased, keeping only letters and digits: "ACC/CERT/1001 ",
 * "acc-cert 1001" and "ＡＣＣ／ＣＥＲＴ／１００１" all become "ACCCERT1001".
 */
export function normalizeCertificateNumber(value: string): string {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * The certificate number exactly as provided — never trimmed or rewritten. Blank means "none";
 * line breaks, tabs and invisible formatting characters (e.g. bidi overrides) are refused rather
 * than silently removed, so what staff see is what was recorded.
 */
const certificateNumberSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .max(64, 'Use at most 64 characters.')
    .refine(
      (value) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value),
      'Remove line breaks, tabs and invisible formatting characters.',
    )
    .refine((value) => /[\p{L}\p{N}]/u.test(value), 'Enter the number exactly as printed.')
    .refine(
      (value) => normalizeCertificateNumber(value).length <= 128,
      'Use at most 64 characters.',
    )
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

/**
 * Staff file variant: the evidential `original` exactly as uploaded, or the `student` copy — the
 * file students receive (for images a separate copy without embedded metadata; for PDFs the original).
 */
export const documentVariantSchema = z.enum(['original', 'student']).default('original');

/** Kinds of embedded metadata found in an uploaded image. Values themselves are never stored. */
export const EMBEDDED_METADATA_CATEGORIES = [
  'LOCATION',
  'DEVICE',
  'PERSON',
  'TEXT',
  'OTHER',
] as const;
export const embeddedMetadataCategorySchema = z.enum(EMBEDDED_METADATA_CATEGORIES);

export const EMBEDDED_METADATA_LABELS: Record<EmbeddedMetadataCategory, string> = {
  LOCATION: 'Location (GPS coordinates or place names)',
  DEVICE: 'Camera or scanner details (make, model, serial number)',
  PERSON: 'Names of people (author, operator, owner, copyright)',
  TEXT: 'Descriptions, comments or other embedded text',
  OTHER: 'Other technical metadata',
};

/**
 * Short human reference for a document, e.g. "HD-1B97-2390": the random tail of its UUIDv7 (the
 * head is a timestamp and is shared by documents uploaded close together). Display only; the full
 * document ID is authoritative.
 */
export function documentReference(id: string): string {
  const tail = id.replace(/-/g, '').slice(-8).toUpperCase();
  return `HD-${tail.slice(0, 4)}-${tail.slice(4)}`;
}

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
    /** Short display reference (see `documentReference`). */
    reference: z.string(),
    /** True when this document replaces an earlier one. */
    isReplacement: z.boolean(),
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

/** One document of a replacement chain, identified by more than its (possibly identical) title. */
const versionSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  /** 1 for the first document of a chain, 2 for its replacement, and so on. */
  revision: z.number().int().positive(),
  title: z.string(),
  certificateNumber: z.string().nullable(),
  status: historicalDocumentStatusSchema,
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
});

/** What students receive. Images: a separate copy without embedded metadata; PDFs: the original. */
const studentCopySchema = z.object({
  status: z.enum(['READY', 'PENDING', 'NOT_REQUIRED']),
  sizeBytes: z.number().int().nullable(),
  sha256: z.string().nullable(),
  createdAt: z.iso.datetime().nullable(),
});

export const historicalDocumentDetailSchema = historicalDocumentRowSchema
  .extend({
    revision: z.number().int().positive(),
    /** Searchable form of `certificateNumber` (see `normalizeCertificateNumber`); never displayed as the number. */
    certificateNumberNormalized: z.string().nullable(),
    studentCopy: studentCopySchema,
    /** Kinds of metadata embedded in the uploaded image (`inspected` is false for PDFs and older uploads). */
    embeddedMetadata: z.object({
      inspected: z.boolean(),
      categories: z.array(embeddedMetadataCategorySchema),
    }),
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
    replaces: versionSchema.nullable(),
    replacedBy: versionSchema.nullable(),
    /** Every document of the replacement chain, oldest first (includes this one). */
    versions: z.array(versionSchema),
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
    reference: z.string(),
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
    /** False while the student copy of an image is still being prepared (no file is served yet). */
    available: z.boolean(),
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
export type DocumentVariant = z.infer<typeof documentVariantSchema>;
export type EmbeddedMetadataCategory = z.infer<typeof embeddedMetadataCategorySchema>;
export type HistoricalDocumentVersion = HistoricalDocumentDetail['versions'][number];
export type HistoricalDocumentRow = z.infer<typeof historicalDocumentRowSchema>;
export type HistoricalDocumentList = z.infer<typeof historicalDocumentListSchema>;
export type HistoricalDocumentQuery = z.infer<typeof historicalDocumentQuerySchema>;
export type HistoricalDocumentDetail = z.infer<typeof historicalDocumentDetailSchema>;
export type StudentDocument = z.infer<typeof studentDocumentSchema>;
export type StudentDocumentList = z.infer<typeof studentDocumentListSchema>;
