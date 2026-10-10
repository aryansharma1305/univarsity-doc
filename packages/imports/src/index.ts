export { type SourceCell, cellDisplay, toSourceCell } from './cells.js';
export { inspectXlsxContainer, verifyXlsxContainer, type ContainerLimits } from './container.js';
export { parseDateCell, parseDateText, calendarDate } from './dates.js';
export {
  appendAudit,
  computeRowCounts,
  loadExistingRegistrations,
  loadReferenceData,
  requireTransition,
  transitionImportJob,
  type Db,
  type ImportAuditEntry,
  type RowCounts,
} from './db.js';
export {
  commitBatch,
  markFailed,
  processImportJob,
  runCommit,
  runParse,
  runValidate,
  stageOf,
  type AttemptInfo,
  type ImportEngine,
  type ImportStage,
  type ImportStepResult,
} from './engine.js';
export { ImportFileError, ImportStateError, StaleImportRunError } from './errors.js';
export {
  suggestResultMapping,
  suggestStudentMapping,
  validateResultMapping,
  validateStudentMapping,
  type MappingProblem,
} from './mapping.js';
export {
  buildErrorReport,
  buildResultErrorReport,
  type ReportRow,
  type ResultReportRow,
  type ResultReportSummary,
} from './report.js';
export { escapeSpreadsheetText, sanitizeFilename } from './safety.js';
export {
  IMPORT_TRANSITIONS,
  RUNNING_IMPORT_STATUSES,
  TERMINAL_IMPORT_STATUSES,
  assertTransition,
  canTransition,
  importActions,
  retryTarget,
} from './state-machine.js';
export {
  PROTECTED_FIELDS,
  UPDATABLE_FIELDS,
  existingValues,
  rollKey,
  validateStudentRows,
  type ExistingRegistration,
  type FieldValues,
  type NormalizedStudentRow,
  type RawRowData,
  type ReferenceData,
  type StudentRowOutcome,
  type StudentValidationContext,
} from './student-rows.js';
export { buildResultTemplate, buildStudentTemplate } from './template.js';
export { uuidv7 } from './uuid.js';
export {
  MAX_WORKSHEETS,
  columnLetter,
  defaultWorksheet,
  describeResultWorksheets,
  describeWorksheets,
  loadWorkbook,
  readWorksheetRows,
  type SourceRow,
} from './workbook.js';
export * from './result-rows.js';
