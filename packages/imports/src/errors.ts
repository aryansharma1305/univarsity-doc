/**
 * A problem with the uploaded FILE (not the system): unreadable workbook, too many rows, zip bomb…
 * The message is safe to show to users. Retrying the same file cannot succeed, so the worker fails
 * the import immediately instead of retrying.
 */
export class ImportFileError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ImportFileError';
  }
}

/**
 * The import job is no longer in the state this worker run was started for (it was cancelled,
 * re-mapped, re-run, or another delivery of the same BullMQ job already finished). The run stops
 * without writing anything.
 */
export class StaleImportRunError extends Error {
  constructor() {
    super('Import run is no longer current');
    this.name = 'StaleImportRunError';
  }
}

/** An attempted state change that the import state machine (or a concurrent change) rejects. */
export class ImportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportStateError';
  }
}
