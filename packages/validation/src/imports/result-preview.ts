import { z } from 'zod';
import { listQuerySchema, optionalFilter, paginatedSchema, refSchema } from '../academic/common.js';
import { academicStructureSchema, MAX_ACADEMIC_PERIODS } from '../academic/curricula.js';
import { examinationKindSchema, examinationStatusSchema } from '../examinations/schemas.js';
import { RESULT_IMPORT_FIELD_KEYS } from './result-fields.js';
import { importIssueSchema } from './schemas.js';

/**
 * Results import PREVIEW (Phase 10B).
 *
 * A staff member chooses an examination context, uploads a results workbook, maps its columns and
 * sees every row classified as VALID / WARNING / ERROR. A preview is temporary (it expires), private
 * to the staff member who created it and never writes marks anywhere: there is no commit, approval
 * or publication step in this phase.
 */

export const resultImportFieldSchema = z.enum(RESULT_IMPORT_FIELD_KEYS);

/** Field → 1-based column number (null/absent = not read). */
export const resultColumnMappingSchema = z.partialRecord(
  resultImportFieldSchema,
  z.number().int().min(1).max(16_384).nullable(),
);

export const resultImportColumnSchema = z.object({
  index: z.number().int().min(1),
  letter: z.string(),
  header: z.string(),
  /** Identity-number columns: never mappable; their cells are dropped when the file is read. */
  sensitive: z.boolean(),
});

export const resultImportSheetSchema = z
  .object({
    name: z.string(),
    rowCount: z.number().int().min(0),
    columnCount: z.number().int().min(0),
    columns: z.array(resultImportColumnSchema),
    suggestedMapping: resultColumnMappingSchema,
    /** Why this sheet cannot be previewed (empty, too many rows/columns), or null. */
    problem: z.string().nullable(),
  })
  .meta({ id: 'ResultImportSheet' });

// ----------------------------------------------------------------------------------------------
// Academic context
// ----------------------------------------------------------------------------------------------

/**
 * The academic context of a preview, as submitted with the upload (multipart text fields). Every
 * identifier is re-checked on the server: the examination must belong to the curriculum, the
 * curriculum to the course, and the session/period must be the examination's own.
 */
export const resultPreviewContextSchema = z
  .object({
    programId: z.uuid({ error: 'Choose the course.' }),
    curriculumId: z.uuid({ error: 'Choose the curriculum version.' }),
    academicSessionId: z.uuid({ error: 'Choose the academic session.' }),
    periodNumber: z.coerce
      .number()
      .int()
      .min(1, 'Choose the semester or year.')
      .max(MAX_ACADEMIC_PERIODS),
    examinationId: z.uuid({ error: 'Choose the examination.' }),
  })
  .strict()
  .meta({ id: 'ResultPreviewContext' });

const periodSchema = z.object({ number: z.number().int(), label: z.string() });

/** Why an examination cannot be used for a results preview (null = it can). */
export const RESULT_CONTEXT_BLOCKERS = [
  'EXAMINATION_DRAFT',
  'EXAMINATION_PUBLISHED',
  'EXAMINATION_ARCHIVED',
  'CURRICULUM_DRAFT',
  'PERIOD_HAS_NO_SUBJECTS',
] as const;
export const resultContextBlockerSchema = z.enum(RESULT_CONTEXT_BLOCKERS);

export const resultImportContextOptionsSchema = z
  .object({
    programs: z.array(
      refSchema.extend({
        curricula: z.array(
          z.object({
            id: z.uuid(),
            versionCode: z.string(),
            name: z.string(),
            status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
            structureType: academicStructureSchema,
            periods: z.array(periodSchema.extend({ subjectCount: z.number().int() })),
            examinations: z.array(
              z.object({
                id: z.uuid(),
                code: z.string(),
                name: z.string(),
                kind: examinationKindSchema,
                status: examinationStatusSchema,
                examSession: z.string(),
                academicSession: refSchema,
                period: periodSchema,
                blocker: resultContextBlockerSchema.nullable(),
              }),
            ),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'ResultImportContextOptions' });

// ----------------------------------------------------------------------------------------------
// Preview
// ----------------------------------------------------------------------------------------------

export const resultPreviewMappingSchema = z
  .object({
    worksheet: z.string().min(1).max(31),
    columns: resultColumnMappingSchema,
  })
  .strict()
  .meta({ id: 'ResultPreviewMapping' });

/** How the selected period's subjects configure a marks component (from `componentConfiguration`). */
export const resultComponentSchema = z.object({
  field: z.enum(['internalMarks', 'externalMarks', 'practicalMarks', 'otherMarks']),
  /** At least one subject of the period declares a maximum for it. */
  configured: z.boolean(),
  /** At least one subject of the period requires it — the column must then be mapped. */
  required: z.boolean(),
});

export const resultPreviewCountsSchema = z.object({
  total: z.number().int(),
  valid: z.number().int(),
  warnings: z.number().int(),
  errors: z.number().int(),
});

export const resultPreviewSchema = z
  .object({
    id: z.uuid(),
    /** MAPPING: waiting for the column mapping; VALIDATED: rows classified (re-mapping allowed). */
    status: z.enum(['MAPPING', 'VALIDATED']),
    /** Always true: nothing in a preview is saved to official records. */
    previewOnly: z.literal(true),
    originalFilename: z.string(),
    fileSizeBytes: z.number().int(),
    createdAt: z.iso.datetime(),
    /** After this moment the preview and its rows are deleted automatically. */
    expiresAt: z.iso.datetime(),
    context: z.object({
      program: refSchema,
      curriculum: z.object({
        id: z.uuid(),
        versionCode: z.string(),
        name: z.string(),
        structureType: academicStructureSchema,
      }),
      academicSession: refSchema,
      period: periodSchema,
      examination: z.object({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        kind: examinationKindSchema,
        examSession: z.string(),
      }),
      subjectCount: z.number().int(),
    }),
    components: z.array(resultComponentSchema),
    /**
     * Assessment component names of the period's subjects that match no marks column (e.g. "Lab")
     * and are therefore not checked. Shown as a configuration notice — never guessed.
     */
    unrecognizedComponents: z.array(z.string()),
    sheets: z.array(resultImportSheetSchema),
    mapping: resultPreviewMappingSchema.nullable(),
    counts: resultPreviewCountsSchema.nullable(),
    hasErrorReport: z.boolean(),
    hasSavedDrafts: z.boolean().optional(),
  })
  .meta({ id: 'ResultPreview' });

export const RESULT_PREVIEW_ROW_FILTERS = ['all', 'valid', 'warnings', 'errors'] as const;

export const resultPreviewRowQuerySchema = listQuerySchema(['rowNumber'] as const, 'rowNumber', {
  filter: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(RESULT_PREVIEW_ROW_FILTERS).default('all'),
  ),
  /** Only rows with issues of this code. */
  code: optionalFilter(z.string().regex(/^[A-Z_]{1,64}$/)),
});

export const resultPreviewRowSchema = z
  .object({
    rowNumber: z.number().int(),
    status: z.enum(['VALID', 'WARNING', 'ERROR']),
    /** As read from the file (normalised: trimmed, upper-case). Never looked up for display. */
    registrationNumber: z.string().nullable(),
    subjectCode: z.string().nullable(),
    /** Name of the matched curriculum subject (only when the row resolved to one). */
    subjectName: z.string().nullable(),
    /** Marks values as read and normalised (what a later import would use). */
    marks: z.partialRecord(resultImportFieldSchema, z.string().nullable()),
    issues: z.array(importIssueSchema),
  })
  .meta({ id: 'ResultPreviewRow' });

export const resultPreviewRowListSchema = paginatedSchema(resultPreviewRowSchema).meta({
  id: 'ResultPreviewRowList',
});

export type ResultColumnMapping = z.infer<typeof resultColumnMappingSchema>;
export type ResultImportColumn = z.infer<typeof resultImportColumnSchema>;
export type ResultImportSheet = z.infer<typeof resultImportSheetSchema>;
export type ResultPreviewContext = z.infer<typeof resultPreviewContextSchema>;
export type ResultPreviewContextInput = z.input<typeof resultPreviewContextSchema>;
export type ResultContextBlocker = z.infer<typeof resultContextBlockerSchema>;
export type ResultImportContextOptions = z.infer<typeof resultImportContextOptionsSchema>;
export type ResultPreviewMapping = z.infer<typeof resultPreviewMappingSchema>;
export type ResultComponent = z.infer<typeof resultComponentSchema>;
export type ResultPreviewCounts = z.infer<typeof resultPreviewCountsSchema>;
export type ResultPreview = z.infer<typeof resultPreviewSchema>;
export type ResultPreviewRowQuery = z.infer<typeof resultPreviewRowQuerySchema>;
export type ResultPreviewRow = z.infer<typeof resultPreviewRowSchema>;
export type ResultPreviewRowList = z.infer<typeof resultPreviewRowListSchema>;
