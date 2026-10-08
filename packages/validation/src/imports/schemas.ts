import { z } from 'zod';
import {
  listQuerySchema,
  optionalFilter,
  paginatedSchema,
  studentStatusSchema,
} from '../academic/common.js';
import { STUDENT_IMPORT_FIELD_KEYS } from './student-fields.js';

export const importTypeSchema = z.enum(['STUDENTS', 'RESULTS']);
export const importStatusSchema = z.enum([
  'UPLOADED',
  'MAPPING',
  'VALIDATING',
  'VALIDATED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export const importRowStatusSchema = z.enum(['VALID', 'WARNING', 'ERROR', 'IMPORTED', 'SKIPPED']);
export const importRowActionSchema = z.enum(['CREATE', 'UPDATE', 'SKIP']);
export const studentImportFieldSchema = z.enum(STUDENT_IMPORT_FIELD_KEYS);

/**
 * How TEXT dates are read. Real Excel date cells are always accepted. ISO (YYYY-MM-DD) is always
 * accepted; DMY/MDY additionally accept DD/MM/YYYY or MM/DD/YYYY (with "/", "-" or ".") — only when
 * the administrator explicitly chooses that format, so "01/02/2026" is never guessed.
 */
export const importDateFormatSchema = z.enum(['ISO', 'DMY', 'MDY']);

export type ImportType = z.infer<typeof importTypeSchema>;
export type ImportStatus = z.infer<typeof importStatusSchema>;
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;
export type ImportRowAction = z.infer<typeof importRowActionSchema>;
export type ImportDateFormat = z.infer<typeof importDateFormatSchema>;

// ------------------------------------------------------------------------------------------
// Worksheets & mapping
// ------------------------------------------------------------------------------------------

export const importColumnSchema = z.object({
  /** 1-based column number. */
  index: z.number().int().min(1),
  /** Spreadsheet column letter (A, B, …, AA). */
  letter: z.string(),
  /** Header text from row 1 ('' when the header cell is empty). */
  header: z.string(),
  /**
   * Government identity numbers and similar (see `isSensitiveImportHeader`): never mappable; their
   * cells are not kept in staging rows, previews or reports.
   */
  sensitive: z.boolean().default(false),
  /**
   * Distinct trimmed values when the column has few of them (≤ 100) and is not sensitive — used to
   * translate course/school/session/status values explicitly. Null when not collected.
   */
  values: z.array(z.string()).nullable().default(null),
});

export const columnMappingSchema = z.partialRecord(
  studentImportFieldSchema,
  z.number().int().min(1).max(16_384).nullable(),
);

export const importSheetSchema = z
  .object({
    name: z.string(),
    /** Data rows below the header row (blank rows are not counted later). */
    rowCount: z.number().int().min(0),
    columnCount: z.number().int().min(0),
    columns: z.array(importColumnSchema),
    suggestedMapping: columnMappingSchema,
    /** Why this sheet cannot be imported (too many rows/columns, empty), or null. */
    problem: z.string().nullable(),
  })
  .meta({ id: 'ImportSheet' });

const valueKey = z.string().max(200);

/**
 * Explicit per-import translations of cell values (keys are `normalizeImportValue(cell)`), e.g.
 * "Certificate in Ultrasound Technology" → a program, "Inactive" → SUSPENDED. Values without an entry
 * are matched by code, then by name (case-insensitive, unambiguous only).
 */
export const importValueMapsSchema = z
  .object({
    programCode: z.record(valueKey, z.uuid()).optional(),
    /** null = "no department" for that value. */
    departmentCode: z.record(valueKey, z.uuid().nullable()).optional(),
    academicSessionCode: z.record(valueKey, z.uuid()).optional(),
    status: z.record(valueKey, studentStatusSchema).optional(),
  })
  .strict();

export const importMappingSchema = z
  .object({
    worksheet: z.string().min(1).max(31),
    /** Field → 1-based column number (null/absent = not imported). */
    columns: columnMappingSchema,
    dateFormat: importDateFormatSchema.default('ISO'),
    valueMaps: importValueMapsSchema.default({}),
    /**
     * Academic session for rows without one (no session column, or a blank cell). Required when no
     * session column is mapped.
     */
    defaultAcademicSessionId: z.uuid().nullable().default(null),
  })
  .strict()
  .meta({ id: 'ImportMapping' });

export const commitImportSchema = z
  .object({
    /** Explicit approval to apply the proposed updates to existing records (default: skip them). */
    applyUpdates: z.boolean().default(false),
  })
  .strict()
  .meta({ id: 'CommitImport' });

export type ImportColumn = z.infer<typeof importColumnSchema>;
export type ColumnMapping = z.infer<typeof columnMappingSchema>;
export type ImportSheet = z.infer<typeof importSheetSchema>;
export type ImportMapping = z.infer<typeof importMappingSchema>;
export type ImportMappingInput = z.input<typeof importMappingSchema>;
export type ImportValueMaps = z.infer<typeof importValueMapsSchema>;
export type CommitImport = z.infer<typeof commitImportSchema>;

// ------------------------------------------------------------------------------------------
// Jobs
// ------------------------------------------------------------------------------------------

const userRefSchema = z.object({ id: z.uuid(), displayName: z.string() });

export const importFailureSchema = z.object({
  stage: z.enum(['PARSE', 'VALIDATE', 'COMMIT']),
  code: z.string(),
  /** Safe, user-facing explanation (never a stack trace). */
  message: z.string(),
  /** True when retrying cannot cause harm and may succeed (a system problem, not a bad file). */
  retryable: z.boolean(),
});

export const importCountsSchema = z.object({
  total: z.number().int(),
  valid: z.number().int(),
  warnings: z.number().int(),
  errors: z.number().int(),
  create: z.number().int(),
  update: z.number().int(),
  unchanged: z.number().int(),
  imported: z.number().int(),
  skipped: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
});

/** Operations allowed in the current state (the state machine lives on the server). */
export const importActionsSchema = z.object({
  map: z.boolean(),
  validate: z.boolean(),
  commit: z.boolean(),
  cancel: z.boolean(),
  retry: z.boolean(),
});

export const importJobSummarySchema = z
  .object({
    id: z.uuid(),
    type: importTypeSchema,
    status: importStatusSchema,
    originalFilename: z.string(),
    createdBy: userRefSchema.nullable(),
    createdAt: z.iso.datetime(),
    progress: z.number().int().min(0).max(100),
    totalRows: z.number().int(),
    importedRows: z.number().int(),
    warningRows: z.number().int(),
    errorRows: z.number().int(),
  })
  .meta({ id: 'ImportJobSummary' });

export const importJobSchema = z
  .object({
    id: z.uuid(),
    type: importTypeSchema,
    status: importStatusSchema,
    originalFilename: z.string(),
    fileSizeBytes: z.number().int().nullable(),
    progress: z.number().int().min(0).max(100),
    sheets: z.array(importSheetSchema),
    mapping: importMappingSchema.nullable(),
    counts: importCountsSchema,
    applyUpdates: z.boolean(),
    failure: importFailureSchema.nullable(),
    hasErrorReport: z.boolean(),
    actions: importActionsSchema,
    createdBy: userRefSchema.nullable(),
    committedBy: userRefSchema.nullable(),
    createdAt: z.iso.datetime(),
    validatedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'ImportJob' });

export const importJobListSchema = paginatedSchema(importJobSummarySchema).meta({
  id: 'ImportJobList',
});

export const IMPORT_SORT_FIELDS = ['createdAt', 'status', 'originalFilename'] as const;
export const importJobQuerySchema = listQuerySchema(IMPORT_SORT_FIELDS, 'createdAt', {
  status: optionalFilter(importStatusSchema),
  type: optionalFilter(importTypeSchema),
  createdById: optionalFilter(z.uuid()),
  /** Created on or after this date (YYYY-MM-DD, UTC). */
  from: optionalFilter(z.iso.date()),
  /** Created on or before this date (YYYY-MM-DD, UTC). */
  to: optionalFilter(z.iso.date()),
});

export const importCreatorListSchema = z
  .object({ data: z.array(userRefSchema) })
  .meta({ id: 'ImportCreatorList' });

export type ImportFailure = z.infer<typeof importFailureSchema>;
export type ImportCounts = z.infer<typeof importCountsSchema>;
export type ImportActions = z.infer<typeof importActionsSchema>;
export type ImportJobSummary = z.infer<typeof importJobSummarySchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type ImportJobList = z.infer<typeof importJobListSchema>;
export type ImportJobQuery = z.infer<typeof importJobQuerySchema>;
export type ImportCreatorList = z.infer<typeof importCreatorListSchema>;

// ------------------------------------------------------------------------------------------
// Rows
// ------------------------------------------------------------------------------------------

export const importIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning']),
  /** The import field the issue is about (null = the whole row). */
  field: studentImportFieldSchema.nullable(),
  message: z.string(),
});

export const IMPORT_ROW_FILTERS = [
  'all',
  'valid',
  'warnings',
  'errors',
  'create',
  'update',
  'skip',
  'imported',
] as const;
export const importRowFilterSchema = z.enum(IMPORT_ROW_FILTERS);

export const importRowQuerySchema = listQuerySchema(['rowNumber'] as const, 'rowNumber', {
  filter: z.preprocess(
    (value) => (value === '' ? undefined : value),
    importRowFilterSchema.default('all'),
  ),
});

export const importRowSummarySchema = z
  .object({
    rowNumber: z.number().int(),
    registrationNumber: z.string().nullable(),
    fullName: z.string().nullable(),
    action: importRowActionSchema.nullable(),
    status: importRowStatusSchema,
    issues: z.array(importIssueSchema),
  })
  .meta({ id: 'ImportRowSummary' });

export const importRowListSchema = paginatedSchema(importRowSummarySchema).meta({
  id: 'ImportRowList',
});

const fieldValuesSchema = z.partialRecord(studentImportFieldSchema, z.string().nullable());

export const importRowDetailSchema = z
  .object({
    rowNumber: z.number().int(),
    status: importRowStatusSchema,
    action: importRowActionSchema.nullable(),
    /** Source cells exactly as read, in column order. */
    source: z.array(
      z.object({ letter: z.string(), header: z.string(), value: z.string().nullable() }),
    ),
    /** Values after normalisation (what would be imported). */
    normalized: fieldValuesSchema,
    /** Current database values of the matching registration (UPDATE / SKIP rows). */
    current: fieldValuesSchema.nullable(),
    /** Proposed changes to the existing record. */
    changes: z.array(
      z.object({
        field: studentImportFieldSchema,
        from: z.string().nullable(),
        to: z.string().nullable(),
      }),
    ),
    issues: z.array(importIssueSchema),
    registrationId: z.uuid().nullable(),
    studentId: z.uuid().nullable(),
  })
  .meta({ id: 'ImportRowDetail' });

export type ImportIssue = z.infer<typeof importIssueSchema>;
export type ImportRowFilter = z.infer<typeof importRowFilterSchema>;
export type ImportRowQuery = z.infer<typeof importRowQuerySchema>;
export type ImportRowSummary = z.infer<typeof importRowSummarySchema>;
export type ImportRowList = z.infer<typeof importRowListSchema>;
export type ImportRowDetail = z.infer<typeof importRowDetailSchema>;

// ------------------------------------------------------------------------------------------
// Worker job payloads (BullMQ)
// ------------------------------------------------------------------------------------------

export const importJobDataSchema = z.object({
  importJobId: z.uuid(),
  /** Must equal import_jobs.active_run_id when the worker writes; otherwise the job is stale. */
  runId: z.uuid(),
  /** The staff member who requested the step (audit actor). */
  actorUserId: z.uuid(),
  /** Request ID of the API call that enqueued the job (audit correlation). */
  correlationId: z.string().max(128).nullable(),
});

export type ImportJobData = z.infer<typeof importJobDataSchema>;
