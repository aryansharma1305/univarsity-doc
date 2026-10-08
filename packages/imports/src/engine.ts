import { Prisma, type PrismaClient } from '@docversity/database';
import { ObjectNotFoundError, type ObjectStorage, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS, IMPORT_JOB_NAMES, type ImportJobName } from '@docversity/types';
import {
  checkRegistrationRelations,
  type ImportFailure,
  type ImportIssue,
  type ImportJobData,
  importJobDataSchema,
  type ImportLimitsEnv,
  type ImportMapping,
  importMappingSchema,
  type ImportRowAction,
  type ImportStatus,
  normalizeRegistrationNumber,
  type StudentImportField,
} from '@docversity/validation';
import { cellDisplay } from './cells.js';
import { verifyXlsxContainer } from './container.js';
import {
  appendAudit,
  chunks,
  computeRowCounts,
  fromDateOnly,
  type ImportAuditEntry,
  loadExistingRegistrations,
  loadExistingRegistrationsById,
  loadReferenceData,
  loadRollIndex,
  lockRun,
  requireTransition,
  type RowCounts,
  setProgress,
} from './db.js';
import { ImportFileError, StaleImportRunError } from './errors.js';
import { buildErrorReport, type ReportRow } from './report.js';
import {
  existingValues,
  type NormalizedStudentRow,
  relationMessage,
  type StudentRowOutcome,
  validateStudentRows,
} from './student-rows.js';
import { uuidv7 } from './uuid.js';
import {
  columnLetter,
  defaultWorksheet,
  describeWorksheets,
  loadWorkbook,
  readWorksheetRows,
} from './workbook.js';

export interface ImportEngine {
  prisma: PrismaClient;
  storage: ObjectStorage;
  limits: ImportLimitsEnv;
}

export type ImportStage = ImportFailure['stage'];
export type ImportStepResult = 'completed' | 'failed' | 'stale';

const MB = 1024 * 1024;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ROW_INSERT_CHUNK = 1_000;
/** Interactive transaction limits for the bulk write steps. */
const TX_OPTIONS = { timeout: 120_000, maxWait: 30_000 } as const;

const STAGE_STATUS: Record<ImportStage, ImportStatus> = {
  PARSE: 'UPLOADED',
  VALIDATE: 'VALIDATING',
  COMMIT: 'PROCESSING',
};

const SYSTEM_FAILURE: Record<ImportStage, string> = {
  PARSE:
    'A system problem stopped the workbook from being read. Nothing was imported. You can retry.',
  VALIDATE: 'A system problem interrupted validation. Nothing was imported. You can retry.',
  COMMIT:
    'A system problem interrupted the import. Rows already imported stay imported and are never imported twice; retrying continues with the remaining rows.',
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function issuesOrNull(
  issues: readonly ImportIssue[],
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return issues.length > 0 ? json(issues) : Prisma.DbNull;
}

function countsAudit(counts: RowCounts): Record<string, number> {
  return {
    totalRows: counts.totalRows,
    validRows: counts.validRows,
    warningRows: counts.warningRows,
    errorRows: counts.errorRows,
    createRows: counts.createRows,
    updateRows: counts.updateRows,
    unchangedRows: counts.unchangedRows,
  };
}

async function readSource(engine: ImportEngine, storageKey: string | null): Promise<Uint8Array> {
  if (!storageKey)
    throw new ImportFileError(
      'SOURCE_MISSING',
      'The uploaded file is missing. Start a new import.',
    );
  try {
    return await engine.storage.getObject(storageKey, {
      maxBytes: engine.limits.IMPORT_MAX_FILE_MB * MB,
    });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new ImportFileError(
        'SOURCE_MISSING',
        'The uploaded file is no longer available. Start a new import.',
      );
    }
    throw error;
  }
}

async function loadRunJob(engine: ImportEngine, data: ImportJobData, status: ImportStatus) {
  const job = await engine.prisma.importJob.findUnique({ where: { id: data.importJobId } });
  if (job?.status !== status || job.activeRunId !== data.runId) throw new StaleImportRunError();
  return job;
}

async function openWorkbook(engine: ImportEngine, storageKey: string | null) {
  const bytes = await readSource(engine, storageKey);
  verifyXlsxContainer(bytes, {
    maxUncompressedBytes: engine.limits.IMPORT_MAX_UNCOMPRESSED_MB * MB,
  });
  return loadWorkbook(bytes);
}

function sheetLimits(engine: ImportEngine) {
  return { maxRows: engine.limits.IMPORT_MAX_ROWS, maxColumns: engine.limits.IMPORT_MAX_COLUMNS };
}

// ----------------------------------------------------------------------------------------------
// PARSE — UPLOADED → MAPPING
// ----------------------------------------------------------------------------------------------

export async function runParse(engine: ImportEngine, data: ImportJobData): Promise<void> {
  const { prisma } = engine;
  const job = await loadRunJob(engine, data, 'UPLOADED');
  await setProgress(prisma, job.id, 'UPLOADED', data.runId, 10);
  const workbook = await openWorkbook(engine, job.storageKey);
  await setProgress(prisma, job.id, 'UPLOADED', data.runId, 60);
  const sheets = describeWorksheets(workbook, sheetLimits(engine));
  const worksheetName = defaultWorksheet(sheets);
  if (!worksheetName) {
    throw new ImportFileError(
      'NO_USABLE_WORKSHEET',
      sheets.length === 1 && sheets[0]?.problem
        ? sheets[0].problem
        : 'None of the worksheets in this file can be imported (they are empty or exceed the limits).',
    );
  }
  await prisma.$transaction(async (tx) => {
    await lockRun(tx, job.id, 'UPLOADED', data.runId);
    await requireTransition(tx, job.id, {
      from: ['UPLOADED'],
      to: 'MAPPING',
      runId: data.runId,
      data: { sheets: json(sheets), worksheetName, progress: 100 },
    });
  });
}

// ----------------------------------------------------------------------------------------------
// VALIDATE — VALIDATING → VALIDATED
// ----------------------------------------------------------------------------------------------

/** The source cell of a mapped column, as displayed (for rows whose value failed validation). */
function rawDisplay(outcome: StudentRowOutcome, column: number | null | undefined): string | null {
  if (!column) return null;
  const cell = outcome.rawData[columnLetter(column)];
  return cell ? cellDisplay(cell) : null;
}

function reportRowFromOutcome(outcome: StudentRowOutcome, mapping: ImportMapping): ReportRow {
  const values = outcome.normalizedData.values;
  return {
    rowNumber: outcome.rowNumber,
    registrationNumber:
      values.registrationNumber ?? rawDisplay(outcome, mapping.columns.registrationNumber),
    fullName: values.fullName ?? rawDisplay(outcome, mapping.columns.fullName),
    status: outcome.status,
    action: outcome.action,
    errors: outcome.errors,
    warnings: outcome.warnings,
  };
}

async function storeReport(
  engine: ImportEngine,
  importJobId: string,
  rows: readonly ReportRow[],
  summary: { filename: string; worksheet: string; counts: Record<string, number> },
): Promise<string | null> {
  if (rows.length === 0) return null;
  const bytes = await buildErrorReport(rows, { ...summary, generatedAt: new Date() });
  const key = objectKeys.importErrorReport(importJobId);
  await engine.storage.putObject(key, bytes, { contentType: XLSX_TYPE });
  return key;
}

async function deleteQuietly(engine: ImportEngine, key: string | null): Promise<void> {
  if (!key) return;
  try {
    await engine.storage.deleteObject(key);
  } catch {
    // An orphaned private report object is harmless; retention cleanup removes it.
  }
}

export async function runValidate(engine: ImportEngine, data: ImportJobData): Promise<void> {
  const { prisma } = engine;
  const job = await loadRunJob(engine, data, 'VALIDATING');
  const mapping = importMappingSchema.parse(job.mapping);
  const progress = (value: number) => setProgress(prisma, job.id, 'VALIDATING', data.runId, value);

  await progress(5);
  const workbook = await openWorkbook(engine, job.storageKey);
  await progress(20);
  const { rows } = readWorksheetRows(workbook, mapping.worksheet, sheetLimits(engine));
  await progress(35);

  // Bulk lookups (chunked), never one query per row.
  const textAt = (cells: (typeof rows)[number]['cells'], column: number | null | undefined) => {
    if (!column) return null;
    const cell = cells[column - 1];
    return cell && (cell.type === 'string' || cell.type === 'number') ? cellDisplay(cell) : null;
  };
  const candidateNumbers: string[] = [];
  const candidateRolls: string[] = [];
  for (const row of rows) {
    const registration = textAt(row.cells, mapping.columns.registrationNumber);
    if (registration?.trim()) candidateNumbers.push(normalizeRegistrationNumber(registration));
    const roll = textAt(row.cells, mapping.columns.rollReferenceNumber);
    if (roll?.trim()) candidateRolls.push(roll);
  }
  const [references, existing, rollIndex] = await Promise.all([
    loadReferenceData(prisma),
    loadExistingRegistrations(prisma, candidateNumbers),
    loadRollIndex(prisma, candidateRolls),
  ]);
  await progress(55);

  const outcomes = validateStudentRows(rows, mapping, { references, existing, rollIndex });
  await progress(65);

  const withIssues = outcomes.filter(
    (outcome) => outcome.errors.length > 0 || outcome.warnings.length > 0,
  );
  const reportKey = await storeReport(
    engine,
    job.id,
    withIssues.map((outcome) => reportRowFromOutcome(outcome, mapping)),
    {
      filename: job.originalFilename,
      worksheet: mapping.worksheet,
      counts: {
        'Rows read': outcomes.length,
        'Rows with errors': outcomes.filter((o) => o.status === 'ERROR').length,
        'Rows with warnings': outcomes.filter((o) => o.warnings.length > 0 && o.status !== 'ERROR')
          .length,
      },
    },
  );
  await progress(75);

  try {
    await prisma.$transaction(async (tx) => {
      await lockRun(tx, job.id, 'VALIDATING', data.runId);
      // Re-validation replaces the previous staging rows of this job.
      await tx.importRow.deleteMany({ where: { importJobId: job.id } });
      for (const chunk of chunks(outcomes, ROW_INSERT_CHUNK)) {
        await tx.importRow.createMany({
          data: chunk.map((outcome) => ({
            importJobId: job.id,
            rowNumber: outcome.rowNumber,
            status: outcome.status,
            action: outcome.action,
            registrationId: outcome.registrationId,
            rawData: json(outcome.rawData),
            normalizedData: json(outcome.normalizedData),
            errors: issuesOrNull(outcome.errors),
            warnings: issuesOrNull(outcome.warnings),
          })),
        });
      }
      const counts = await computeRowCounts(tx, job.id);
      await requireTransition(tx, job.id, {
        from: ['VALIDATING'],
        to: 'VALIDATED',
        runId: data.runId,
        data: {
          ...counts,
          progress: 100,
          validatedAt: new Date(),
          errorReportStorageKey: reportKey,
          errorReportCreatedAt: reportKey ? new Date() : null,
        },
      });
      await appendAudit(tx, [
        {
          actorUserId: data.actorUserId,
          action: AUDIT_ACTIONS.studentImportValidated,
          entityType: 'ImportJob',
          entityId: job.id,
          metadata: { importJobId: job.id, ...countsAudit(counts) },
          correlationId: data.correlationId,
        },
      ]);
    }, TX_OPTIONS);
  } catch (error) {
    await deleteQuietly(engine, reportKey);
    throw error;
  }
  if (job.errorReportStorageKey && job.errorReportStorageKey !== reportKey) {
    await deleteQuietly(engine, job.errorReportStorageKey);
  }
}

// ----------------------------------------------------------------------------------------------
// COMMIT — PROCESSING → COMPLETED (batched, idempotent)
// ----------------------------------------------------------------------------------------------

interface BatchContext {
  importJobId: string;
  runId: string;
  actorUserId: string;
  correlationId: string | null;
  actions: ImportRowAction[];
  batchSize: number;
}

const PERSONAL_FIELDS: readonly StudentImportField[] = [
  'fullName',
  'fatherName',
  'motherName',
  'dateOfBirth',
  'gender',
];
const REGISTRATION_FIELDS: readonly StudentImportField[] = [
  'rollReferenceNumber',
  'admissionDate',
  'completionDate',
];
const DATE_FIELDS: readonly StudentImportField[] = [
  'dateOfBirth',
  'admissionDate',
  'completionDate',
];

function rowError(
  code: string,
  message: string,
  field: StudentImportField | null = null,
): ImportIssue {
  return { code, severity: 'error', field, message };
}

/**
 * Commits the next batch of pending rows in ONE transaction. Idempotent:
 * - the job row is locked (FOR UPDATE) and the run is re-checked, so duplicate deliveries of the
 *   same BullMQ job run one after the other, never concurrently;
 * - only rows still VALID/WARNING are picked; a committed row becomes IMPORTED in the same
 *   transaction as the records it created, so a retry can never commit it twice;
 * - the registration-number unique index is the final guard against duplicates.
 * Every row is re-checked against the CURRENT database (master data may have changed since
 * validation); rows that no longer pass become ERROR rows instead of failing the batch.
 */
export async function commitBatch(
  tx: Prisma.TransactionClient,
  context: BatchContext,
): Promise<{ done: boolean; processed: number }> {
  await lockRun(tx, context.importJobId, 'PROCESSING', context.runId);
  const rows = await tx.importRow.findMany({
    where: {
      importJobId: context.importJobId,
      status: { in: ['VALID', 'WARNING'] },
      action: { in: context.actions },
    },
    orderBy: { rowNumber: 'asc' },
    take: context.batchSize,
    select: {
      id: true,
      rowNumber: true,
      action: true,
      registrationId: true,
      normalizedData: true,
      errors: true,
    },
  });
  if (rows.length === 0) return { done: true, processed: 0 };

  const parsed = rows.map((row) => ({
    ...row,
    data: row.normalizedData as unknown as NormalizedStudentRow,
  }));
  const creates = parsed.filter((row) => row.action === 'CREATE');
  const updates = parsed.filter((row) => row.action === 'UPDATE');

  const [references, existingByNumber, existingById] = await Promise.all([
    loadReferenceData(tx),
    loadExistingRegistrations(
      tx,
      creates.map((row) => row.data.registrationNumberNormalized ?? ''),
    ),
    loadExistingRegistrationsById(
      tx,
      updates.map((row) => row.registrationId ?? ''),
    ),
  ]);
  const programs = new Map(references.programs.map((program) => [program.id, program]));
  const sessions = new Map(references.sessions.map((session) => [session.id, session]));
  const departments = new Map(
    references.departments.map((department) => [department.id, department]),
  );

  const failures: { id: string; previous: unknown; issue: ImportIssue }[] = [];
  const imported: { id: string; registrationId: string }[] = [];
  const students: Prisma.StudentCreateManyInput[] = [];
  const registrations: Prisma.StudentRegistrationCreateManyInput[] = [];
  const audits: ImportAuditEntry[] = [];
  const auditBase = { actorUserId: context.actorUserId, correlationId: context.correlationId };

  for (const row of creates) {
    const values = row.data.values;
    const normalized = row.data.registrationNumberNormalized;
    if (!normalized || !values.registrationNumber || !values.fullName) {
      failures.push({
        id: row.id,
        previous: row.errors,
        issue: rowError('INVALID_ROW', 'The row is incomplete. Re-validate the import.'),
      });
      continue;
    }
    if (existingByNumber.has(normalized)) {
      failures.push({
        id: row.id,
        previous: row.errors,
        issue: rowError(
          'REGISTRATION_ALREADY_EXISTS',
          `Registration number ${values.registrationNumber} was created after validation (another import or a manual entry). Re-validate to review it.`,
          'registrationNumber',
        ),
      });
      continue;
    }
    const program = row.data.programId ? programs.get(row.data.programId) : undefined;
    const session = row.data.academicSessionId
      ? sessions.get(row.data.academicSessionId)
      : undefined;
    if (!program || !session) {
      failures.push({
        id: row.id,
        previous: row.errors,
        issue: rowError('INVALID_ROW', 'The program or academic session no longer exists.'),
      });
      continue;
    }
    const relation = checkRegistrationRelations(
      {
        program,
        session,
        departmentId: row.data.departmentId,
        department: row.data.departmentId ? (departments.get(row.data.departmentId) ?? null) : null,
      },
      { program: true, session: true, department: true },
    );
    if (!relation.ok) {
      const department = row.data.departmentId ? departments.get(row.data.departmentId) : undefined;
      failures.push({
        id: row.id,
        previous: row.errors,
        issue: rowError(
          relation.issue.code,
          `Changed since validation: ${relationMessage(relation.issue.code, program, session, department?.code ?? null)}`,
          relation.issue.field === 'program'
            ? 'programCode'
            : relation.issue.field === 'academicSession'
              ? 'academicSessionCode'
              : 'departmentCode',
        ),
      });
      continue;
    }
    const studentId = uuidv7();
    const registrationId = uuidv7();
    students.push({
      id: studentId,
      fullName: values.fullName,
      fatherName: values.fatherName ?? null,
      motherName: values.motherName ?? null,
      dateOfBirth: fromDateOnly(values.dateOfBirth),
      gender: values.gender ?? null,
    });
    const status = (values.status ?? 'ACTIVE') as 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'REVOKED';
    registrations.push({
      id: registrationId,
      studentId,
      registrationNumber: values.registrationNumber,
      registrationNumberNormalized: normalized,
      rollReferenceNumber: values.rollReferenceNumber ?? null,
      programId: relation.programId,
      departmentId: relation.departmentId,
      academicSessionId: relation.academicSessionId,
      admissionDate: fromDateOnly(values.admissionDate),
      completionDate: fromDateOnly(values.completionDate),
      status,
    });
    const source = { source: 'import', importJobId: context.importJobId, rowNumber: row.rowNumber };
    audits.push(
      {
        ...auditBase,
        action: AUDIT_ACTIONS.studentCreated,
        entityType: 'Student',
        entityId: studentId,
        metadata: source,
      },
      {
        ...auditBase,
        action: AUDIT_ACTIONS.registrationCreated,
        entityType: 'StudentRegistration',
        entityId: registrationId,
        metadata: { ...source, studentId, registrationNumber: values.registrationNumber, status },
      },
    );
    imported.push({ id: row.id, registrationId });
  }

  if (students.length > 0) {
    await tx.student.createMany({ data: students });
    await tx.studentRegistration.createMany({ data: registrations });
  }

  for (const row of updates) {
    const current = row.registrationId ? existingById.get(row.registrationId) : undefined;
    const snapshot = row.data.current;
    const now = current ? existingValues(current) : null;
    const unchanged =
      now !== null &&
      snapshot !== null &&
      (Object.keys(snapshot) as StudentImportField[]).every(
        (field) => (snapshot[field] ?? null) === (now[field] ?? null),
      );
    if (!current || !unchanged) {
      failures.push({
        id: row.id,
        previous: row.errors,
        issue: rowError(
          'RECORD_CHANGED_SINCE_VALIDATION',
          'The existing record was changed after validation. Re-validate the import to review the current values.',
        ),
      });
      continue;
    }
    const personal: Prisma.StudentUpdateInput = {};
    const registration: Prisma.StudentRegistrationUpdateInput = {};
    const personalChanged: string[] = [];
    const registrationChanged: string[] = [];
    for (const change of row.data.changes) {
      const value = DATE_FIELDS.includes(change.field) ? fromDateOnly(change.to) : change.to;
      if (PERSONAL_FIELDS.includes(change.field)) {
        (personal as Record<string, unknown>)[change.field] = value;
        personalChanged.push(change.field);
      } else if (REGISTRATION_FIELDS.includes(change.field)) {
        (registration as Record<string, unknown>)[change.field] = value;
        registrationChanged.push(change.field);
      }
    }
    const source = { source: 'import', importJobId: context.importJobId, rowNumber: row.rowNumber };
    if (personalChanged.length > 0) {
      await tx.student.update({ where: { id: current.studentId }, data: personal });
      audits.push({
        ...auditBase,
        action: AUDIT_ACTIONS.studentUpdated,
        entityType: 'Student',
        entityId: current.studentId,
        metadata: { ...source, changedFields: personalChanged },
      });
    }
    if (registrationChanged.length > 0) {
      await tx.studentRegistration.update({ where: { id: current.id }, data: registration });
      audits.push({
        ...auditBase,
        action: AUDIT_ACTIONS.registrationUpdated,
        entityType: 'StudentRegistration',
        entityId: current.id,
        metadata: {
          ...source,
          studentId: current.studentId,
          registrationNumber: current.registrationNumber,
          changedFields: registrationChanged,
        },
      });
    }
    imported.push({ id: row.id, registrationId: current.id });
  }

  await appendAudit(tx, audits);
  if (imported.length > 0) {
    await tx.$executeRaw`
      UPDATE import_rows AS r
         SET status = 'IMPORTED', registration_id = v.registration_id, updated_at = now()
        FROM unnest(${imported.map((row) => row.id)}::uuid[], ${imported.map((row) => row.registrationId)}::uuid[])
             AS v(row_id, registration_id)
       WHERE r.id = v.row_id`;
  }
  for (const failure of failures) {
    const previous = Array.isArray(failure.previous) ? (failure.previous as ImportIssue[]) : [];
    await tx.importRow.update({
      where: { id: failure.id },
      data: { status: 'ERROR', action: null, errors: json([...previous, failure.issue]) },
    });
  }
  return { done: false, processed: rows.length };
}

export async function runCommit(engine: ImportEngine, data: ImportJobData): Promise<void> {
  const { prisma } = engine;
  const job = await loadRunJob(engine, data, 'PROCESSING');
  const actions: ImportRowAction[] = job.applyUpdates ? ['CREATE', 'UPDATE'] : ['CREATE'];
  const context: BatchContext = {
    importJobId: job.id,
    runId: data.runId,
    actorUserId: data.actorUserId,
    correlationId: data.correlationId,
    actions,
    batchSize: engine.limits.IMPORT_BATCH_SIZE,
  };
  const pendingWhere = {
    importJobId: job.id,
    status: { in: ['VALID', 'WARNING'] as ('VALID' | 'WARNING')[] },
    action: { in: actions },
  };
  const initialPending = await prisma.importRow.count({ where: pendingWhere });
  let processed = 0;
  await setProgress(prisma, job.id, 'PROCESSING', data.runId, 5);

  for (;;) {
    const batch = await prisma.$transaction((tx) => commitBatch(tx, context), TX_OPTIONS);
    if (batch.done) break;
    processed += batch.processed;
    const fraction = initialPending === 0 ? 1 : Math.min(1, processed / initialPending);
    await setProgress(prisma, job.id, 'PROCESSING', data.runId, 5 + fraction * 85);
  }

  // Final report: every row that still carries an error or a warning.
  const issueRows = await prisma.importRow.findMany({
    where: {
      importJobId: job.id,
      OR: [{ errors: { not: Prisma.AnyNull } }, { warnings: { not: Prisma.AnyNull } }],
    },
    orderBy: { rowNumber: 'asc' },
    select: {
      rowNumber: true,
      status: true,
      action: true,
      normalizedData: true,
      errors: true,
      warnings: true,
    },
  });
  const reportRows: ReportRow[] = issueRows.map((row) => {
    const normalized = row.normalizedData as unknown as NormalizedStudentRow | null;
    return {
      rowNumber: row.rowNumber,
      registrationNumber: normalized?.values.registrationNumber ?? null,
      fullName: normalized?.values.fullName ?? null,
      status: row.status,
      action: row.action,
      errors: (row.errors as ImportIssue[] | null) ?? [],
      warnings: (row.warnings as ImportIssue[] | null) ?? [],
    };
  });
  const before = await computeRowCounts(prisma, job.id);
  const reportKey = await storeReport(engine, job.id, reportRows, {
    filename: job.originalFilename,
    worksheet: job.worksheetName ?? '',
    counts: {
      'Rows read': before.totalRows,
      'Rows imported': before.importedRows,
      'Rows with errors': before.errorRows,
    },
  });
  await setProgress(prisma, job.id, 'PROCESSING', data.runId, 95);

  try {
    await prisma.$transaction(async (tx) => {
      await lockRun(tx, job.id, 'PROCESSING', data.runId);
      // Importable rows that were not committed (unchanged rows, unapproved updates) are skipped.
      await tx.importRow.updateMany({
        where: { importJobId: job.id, status: { in: ['VALID', 'WARNING'] } },
        data: { status: 'SKIPPED' },
      });
      const counts = await computeRowCounts(tx, job.id);
      await requireTransition(tx, job.id, {
        from: ['PROCESSING'],
        to: 'COMPLETED',
        runId: data.runId,
        data: {
          ...counts,
          progress: 100,
          completedAt: new Date(),
          errorReportStorageKey: reportKey,
          errorReportCreatedAt: reportKey ? new Date() : null,
        },
      });
      await appendAudit(tx, [
        {
          actorUserId: data.actorUserId,
          action: AUDIT_ACTIONS.studentImportCommitted,
          entityType: 'ImportJob',
          entityId: job.id,
          metadata: {
            importJobId: job.id,
            createdRecords: counts.createdRecords,
            updatedRecords: counts.updatedRecords,
            importedRows: counts.importedRows,
            skippedRows: counts.skippedRows,
            errorRows: counts.errorRows,
            applyUpdates: job.applyUpdates,
          },
          correlationId: data.correlationId,
        },
      ]);
    }, TX_OPTIONS);
  } catch (error) {
    await deleteQuietly(engine, reportKey);
    throw error;
  }
  if (job.errorReportStorageKey && job.errorReportStorageKey !== reportKey) {
    await deleteQuietly(engine, job.errorReportStorageKey);
  }
}

// ----------------------------------------------------------------------------------------------
// Dispatch + failure handling
// ----------------------------------------------------------------------------------------------

export function stageOf(name: ImportJobName): ImportStage {
  switch (name) {
    case IMPORT_JOB_NAMES.parse:
      return 'PARSE';
    case IMPORT_JOB_NAMES.validate:
      return 'VALIDATE';
    case IMPORT_JOB_NAMES.commit:
      return 'COMMIT';
  }
}

/** Marks the job FAILED with a safe reason (only if this run still owns it). */
export async function markFailed(
  engine: ImportEngine,
  data: ImportJobData,
  stage: ImportStage,
  failure: Omit<ImportFailure, 'stage'>,
): Promise<boolean> {
  try {
    return await engine.prisma.$transaction(async (tx) => {
      await lockRun(tx, data.importJobId, STAGE_STATUS[stage], data.runId);
      await requireTransition(tx, data.importJobId, {
        from: [STAGE_STATUS[stage]],
        to: 'FAILED',
        runId: data.runId,
        data: { failure: json({ stage, ...failure }) },
      });
      await appendAudit(tx, [
        {
          actorUserId: data.actorUserId,
          action: AUDIT_ACTIONS.studentImportFailed,
          entityType: 'ImportJob',
          entityId: data.importJobId,
          metadata: {
            importJobId: data.importJobId,
            stage,
            code: failure.code,
            retryable: failure.retryable,
          },
          correlationId: data.correlationId,
        },
      ]);
      return true;
    });
  } catch (error) {
    if (error instanceof StaleImportRunError) return false;
    throw error;
  }
}

export interface AttemptInfo {
  /** Attempts already made before this one (BullMQ `job.attemptsMade`). */
  attemptsMade: number;
  /** Total attempts allowed (BullMQ `job.opts.attempts`). */
  attempts: number;
}

/**
 * Runs one import step for a BullMQ job.
 * - A problem with the FILE (ImportFileError) fails the import immediately with a safe message —
 *   retrying the same file cannot help, so it is not a retry condition.
 * - A stale run (cancelled, superseded, duplicate delivery already done) stops silently.
 * - Anything else is treated as transient and rethrown so BullMQ retries with backoff; on the final
 *   attempt the import is marked FAILED (retryable) with a generic message — never a stack trace.
 * Row-level validation problems are data, not exceptions: they never reach this handler.
 */
export async function processImportJob(
  engine: ImportEngine,
  name: string,
  payload: unknown,
  attempt: AttemptInfo,
): Promise<ImportStepResult> {
  const knownNames: readonly string[] = Object.values(IMPORT_JOB_NAMES);
  if (!knownNames.includes(name)) throw new Error(`Unknown import job "${name}"`);
  const stage = stageOf(name as ImportJobName);
  const data = importJobDataSchema.parse(payload);
  try {
    if (stage === 'PARSE') await runParse(engine, data);
    else if (stage === 'VALIDATE') await runValidate(engine, data);
    else await runCommit(engine, data);
    return 'completed';
  } catch (error) {
    if (error instanceof StaleImportRunError) return 'stale';
    if (error instanceof ImportFileError) {
      await markFailed(engine, data, stage, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
      return 'failed';
    }
    if (attempt.attemptsMade + 1 >= attempt.attempts) {
      await markFailed(engine, data, stage, {
        code: 'SYSTEM_ERROR',
        message: SYSTEM_FAILURE[stage],
        retryable: true,
      }).catch(() => false);
    }
    throw error;
  }
}
