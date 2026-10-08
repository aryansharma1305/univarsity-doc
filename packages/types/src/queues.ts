/**
 * BullMQ queue and job names shared by producers (API, scripts) and the worker.
 */
export const QUEUE_NAMES = {
  /** Infrastructure/system jobs only — never business work. */
  system: 'system',
  /** Spreadsheet imports: parse → validate → commit (Phase 5: students). */
  imports: 'imports',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const SYSTEM_JOB_NAMES = {
  healthTest: 'health-test',
} as const;

export type SystemJobName = (typeof SYSTEM_JOB_NAMES)[keyof typeof SYSTEM_JOB_NAMES];

/**
 * Import job names. Each one is one step of the persisted import state machine; the payload is
 * `ImportJobData` (@docversity/validation).
 */
export const IMPORT_JOB_NAMES = {
  /** Read the workbook: worksheets, headers, mapping suggestions. UPLOADED → MAPPING. */
  parse: 'import.parse',
  /** Read the chosen worksheet, validate and classify every row, build the error report. VALIDATING → VALIDATED. */
  validate: 'import.validate',
  /** Commit valid rows in batches, then build the final report. PROCESSING → COMPLETED. */
  commit: 'import.commit',
} as const;

export type ImportJobName = (typeof IMPORT_JOB_NAMES)[keyof typeof IMPORT_JOB_NAMES];
