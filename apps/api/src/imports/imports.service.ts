import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@docversity/database';
import {
  buildStudentTemplate,
  type FieldValues,
  ImportFileError,
  ImportStateError,
  importActions,
  inspectXlsxContainer,
  type NormalizedStudentRow,
  type RawRowData,
  retryTarget,
  sanitizeFilename,
  transitionImportJob,
  uuidv7,
  validateStudentMapping,
  cellDisplay,
} from '@docversity/imports';
import { type ObjectStorage, ObjectNotFoundError, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS, IMPORT_JOB_NAMES, type ImportJobName } from '@docversity/types';
import {
  type CommitImport,
  ERROR_CODES,
  type ImportCreatorList,
  type ImportFailure,
  type ImportIssue,
  type ImportJob,
  type ImportJobData,
  type ImportJobList,
  type ImportJobQuery,
  type ImportJobSummary,
  type ImportMapping,
  importFailureSchema,
  importMappingSchema,
  type ImportRowDetail,
  type ImportRowFilter,
  type ImportRowList,
  type ImportRowQuery,
  type ImportSheet,
  importSheetSchema,
  type ImportStatus,
  type ImportType,
  STUDENT_IMPORT_FIELD_KEYS,
} from '@docversity/validation';
import type { Queue } from 'bullmq';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { currentRequestId } from '../common/request-context.js';
import { withTimeout } from '../common/with-timeout.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { IMPORT_QUEUE } from '../queue/queue.module.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import type { UploadedWorkbook } from './upload.interceptor.js';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * MIME types browsers report for .xlsx files. The type is a hint only: the extension and the file's
 * actual structure (ZIP container with workbook parts) are checked too, and the worker parses it.
 */
const ACCEPTED_MIME_TYPES = new Set([
  XLSX_CONTENT_TYPE,
  'application/octet-stream',
  'application/zip',
  '',
]);

const MB = 1024 * 1024;
const ENQUEUE_TIMEOUT_MS = 5_000;

const userRef = { select: { id: true, displayName: true } } as const;
const jobInclude = { createdBy: userRef, committedBy: userRef } as const;
type JobRow = Prisma.ImportJobGetPayload<{ include: typeof jobInclude }>;

export interface DownloadFile {
  filename: string;
  bytes: Uint8Array;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function parseSheets(value: Prisma.JsonValue | null): ImportSheet[] {
  const parsed = importSheetSchema.array().safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

function parseMapping(value: Prisma.JsonValue | null): ImportMapping | null {
  if (value === null) return null;
  const parsed = importMappingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseFailure(value: Prisma.JsonValue | null): ImportFailure | null {
  if (value === null) return null;
  const parsed = importFailureSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function issues(value: Prisma.JsonValue | null): ImportIssue[] {
  return Array.isArray(value) ? (value as unknown as ImportIssue[]) : [];
}

function stateConflict(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
}

const STATUS_WORDS: Record<ImportStatus, string> = {
  UPLOADED: 'still reading the workbook',
  MAPPING: 'waiting for the column mapping',
  VALIDATING: 'being validated',
  VALIDATED: 'validated and waiting for review',
  PROCESSING: 'being imported',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

function notNow(job: { status: ImportStatus }, action: string): AppError {
  return stateConflict(`This import is ${STATUS_WORDS[job.status]}, so it cannot ${action} now.`);
}

/**
 * Student import API: owns the HTTP-facing half of the import state machine (create/upload, mapping,
 * validate/commit/cancel/retry requests, history, rows, downloads). Heavy work runs in the worker
 * (@docversity/imports); every state change here is a compare-and-set, so double clicks and
 * concurrent requests cannot start a step twice.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger('Imports');
  private template: Uint8Array | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(IMPORT_QUEUE) private readonly queue: Queue,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Template
  // ------------------------------------------------------------------------------------------

  async studentTemplate(): Promise<DownloadFile> {
    this.template ??= await buildStudentTemplate();
    return { filename: 'docversity-student-import-template.xlsx', bytes: this.template };
  }

  // ------------------------------------------------------------------------------------------
  // Create + upload
  // ------------------------------------------------------------------------------------------

  async create(
    type: ImportType,
    file: UploadedWorkbook | undefined,
    actorUserId: string,
  ): Promise<ImportJob> {
    if (type !== 'STUDENTS') {
      throw Errors.validation([{ path: 'type', message: 'Only student imports are available.' }]);
    }
    if (!file || file.size === 0) {
      throw Errors.validation([{ path: 'file', message: 'Choose an .xlsx file to upload.' }]);
    }
    const filename = sanitizeFilename(file.originalname);
    if (extname(filename).toLowerCase() !== '.xlsx') {
      throw this.unsupported(
        'Only .xlsx workbooks are accepted. Save the file as "Excel Workbook (.xlsx)".',
      );
    }
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      throw this.unsupported('This file type is not accepted. Upload an Excel workbook (.xlsx).');
    }
    const bytes = new Uint8Array(
      file.buffer.buffer,
      file.buffer.byteOffset,
      file.buffer.byteLength,
    );
    try {
      inspectXlsxContainer(bytes, {
        maxUncompressedBytes: this.config.IMPORT_MAX_UNCOMPRESSED_MB * MB,
      });
    } catch (error) {
      if (error instanceof ImportFileError) throw this.unsupported(error.message);
      throw error;
    }

    const id = uuidv7();
    const runId = randomUUID();
    const storageKey = objectKeys.importSource(id);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await this.storage.putObject(storageKey, bytes, { contentType: XLSX_CONTENT_TYPE });

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.importJob.create({
          data: {
            id,
            type: 'STUDENTS',
            originalFilename: filename,
            storageKey,
            fileSizeBytes: bytes.byteLength,
            fileSha256: sha256,
            status: 'UPLOADED',
            activeRunId: runId,
            createdByUserId: actorUserId,
            startedAt: new Date(),
          },
        });
        const metadata = { importJobId: id, type: 'STUDENTS', fileSizeBytes: bytes.byteLength };
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.studentImportCreated,
            entityType: 'ImportJob',
            entityId: id,
            metadata,
          },
          tx,
        );
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.studentImportUploaded,
            entityType: 'ImportJob',
            entityId: id,
            metadata: { ...metadata, sha256 },
          },
          tx,
        );
      });
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
    await this.enqueue(id, 'UPLOADED', IMPORT_JOB_NAMES.parse, runId, actorUserId);
    return this.get(id);
  }

  private unsupported(message: string): AppError {
    return new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.unsupportedFile, message, {
      details: [{ path: 'file', message }],
    });
  }

  /**
   * Enqueues a worker step for a job that was just moved into `status` with `runId`. If the queue
   * is unreachable the job is marked FAILED (retryable) so it never sits in a running state with no
   * worker job behind it.
   */
  private async enqueue(
    importJobId: string,
    status: ImportStatus,
    name: ImportJobName,
    runId: string,
    actorUserId: string,
  ): Promise<void> {
    const data: ImportJobData = {
      importJobId,
      runId,
      actorUserId,
      correlationId: currentRequestId() ?? null,
    };
    try {
      // One BullMQ job per run (jobId = run id): enqueuing the same run twice is a no-op.
      await withTimeout(
        () => this.queue.add(name, data, { jobId: `${name.replace('.', '-')}-${runId}` }),
        ENQUEUE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Could not enqueue import job',
        importJobId,
        job: name,
        err: error,
      });
      const stage =
        name === IMPORT_JOB_NAMES.parse
          ? 'PARSE'
          : name === IMPORT_JOB_NAMES.validate
            ? 'VALIDATE'
            : 'COMMIT';
      await transitionImportJob(this.prisma.client, importJobId, {
        from: [status],
        to: 'FAILED',
        runId,
        data: {
          failure: {
            stage,
            code: 'QUEUE_UNAVAILABLE',
            message:
              'The background worker queue was unavailable. Nothing was processed; you can retry.',
            retryable: true,
          },
        },
      });
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.serviceUnavailable,
        'Background processing is temporarily unavailable. The import was kept; retry it shortly.',
      );
    }
  }

  // ------------------------------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------------------------------

  async list(query: ImportJobQuery): Promise<ImportJobList> {
    const where: Prisma.ImportJobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.createdById ? { createdByUserId: query.createdById } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to
                ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
      ...(query.search
        ? { originalFilename: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.importJob.findMany({
        where,
        include: jobInclude,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.importJob.count({ where }),
    ]);
    return { data: rows.map((row) => this.toSummary(row)), meta: paginationMeta(query, total) };
  }

  async creators(): Promise<ImportCreatorList> {
    const users = await this.prisma.client.user.findMany({
      where: { importJobs: { some: {} } },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: 200,
    });
    return { data: users };
  }

  async get(id: string): Promise<ImportJob> {
    return this.toDetail(await this.findJob(id));
  }

  private async findJob(id: string): Promise<JobRow> {
    const job = await this.prisma.client.importJob.findUnique({
      where: { id },
      include: jobInclude,
    });
    if (!job) throw Errors.notFound();
    return job;
  }

  private toSummary(row: JobRow): ImportJobSummary {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      originalFilename: row.originalFilename,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      progress: row.progress,
      totalRows: row.totalRows,
      importedRows: row.importedRows,
      warningRows: row.warningRows,
      errorRows: row.errorRows,
    };
  }

  private toDetail(row: JobRow): ImportJob {
    const failure = parseFailure(row.failure);
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      originalFilename: row.originalFilename,
      fileSizeBytes: row.fileSizeBytes,
      progress: row.progress,
      sheets: parseSheets(row.sheets),
      mapping: parseMapping(row.mapping),
      counts: {
        total: row.totalRows,
        valid: row.validRows,
        warnings: row.warningRows,
        errors: row.errorRows,
        create: row.createRows,
        update: row.updateRows,
        unchanged: row.unchangedRows,
        imported: row.importedRows,
        skipped: row.skippedRows,
        created: row.createdRecords,
        updated: row.updatedRecords,
      },
      applyUpdates: row.applyUpdates,
      failure,
      hasErrorReport: row.errorReportStorageKey !== null,
      actions: importActions(row.status, failure),
      createdBy: row.createdBy,
      committedBy: row.committedBy,
      createdAt: row.createdAt.toISOString(),
      validatedAt: iso(row.validatedAt),
      completedAt: iso(row.completedAt),
      cancelledAt: iso(row.cancelledAt),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ------------------------------------------------------------------------------------------
  // Rows
  // ------------------------------------------------------------------------------------------

  private rowFilter(filter: ImportRowFilter): Prisma.ImportRowWhereInput {
    switch (filter) {
      case 'all':
        return {};
      case 'valid':
        return { status: { not: 'ERROR' }, warnings: { equals: Prisma.AnyNull } };
      case 'warnings':
        return { status: { not: 'ERROR' }, warnings: { not: Prisma.AnyNull } };
      case 'errors':
        return { status: 'ERROR' };
      case 'create':
        return { action: 'CREATE' };
      case 'update':
        return { action: 'UPDATE' };
      case 'skip':
        return { action: 'SKIP' };
      case 'imported':
        return { status: 'IMPORTED' };
    }
  }

  async rows(id: string, query: ImportRowQuery): Promise<ImportRowList> {
    await this.findJob(id);
    const where: Prisma.ImportRowWhereInput = { importJobId: id, ...this.rowFilter(query.filter) };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.importRow.findMany({
        where,
        orderBy: { rowNumber: query.sortOrder },
        select: {
          rowNumber: true,
          status: true,
          action: true,
          normalizedData: true,
          errors: true,
          warnings: true,
        },
        ...pageArgs(query),
      }),
      this.prisma.client.importRow.count({ where }),
    ]);
    return {
      data: rows.map((row) => {
        const normalized = row.normalizedData as unknown as NormalizedStudentRow | null;
        return {
          rowNumber: row.rowNumber,
          registrationNumber: normalized?.values.registrationNumber ?? null,
          fullName: normalized?.values.fullName ?? null,
          action: row.action,
          status: row.status,
          issues: [...issues(row.errors), ...issues(row.warnings)],
        };
      }),
      meta: paginationMeta(query, total),
    };
  }

  async row(id: string, rowNumber: number): Promise<ImportRowDetail> {
    const job = await this.findJob(id);
    const row = await this.prisma.client.importRow.findUnique({
      where: { importJobId_rowNumber: { importJobId: id, rowNumber } },
      include: { registration: { select: { studentId: true } } },
    });
    if (!row) throw Errors.notFound();
    const sheet = parseSheets(job.sheets).find((candidate) => candidate.name === job.worksheetName);
    const raw = row.rawData as unknown as RawRowData;
    const normalized = row.normalizedData as unknown as NormalizedStudentRow | null;
    const pick = (values: FieldValues | null | undefined) =>
      values
        ? Object.fromEntries(
            STUDENT_IMPORT_FIELD_KEYS.filter((key) => key in values).map((key) => [
              key,
              values[key] ?? null,
            ]),
          )
        : null;
    return {
      rowNumber: row.rowNumber,
      status: row.status,
      action: row.action,
      // Identity-number columns are never staged, so they are not listed.
      source: (sheet?.columns ?? [])
        .filter((column) => !column.sensitive)
        .map((column) => {
          const cell = raw[column.letter];
          return {
            letter: column.letter,
            header: column.header,
            value: cell ? cellDisplay(cell) : null,
          };
        }),
      normalized: pick(normalized?.values) ?? {},
      current: pick(normalized?.current),
      changes: (normalized?.changes ?? []).map((change) => ({
        field: change.field,
        from: change.from,
        to: change.to,
      })),
      issues: [...issues(row.errors), ...issues(row.warnings)],
      registrationId: row.registrationId,
      studentId: row.registration?.studentId ?? normalized?.studentId ?? null,
    };
  }

  async errorReport(id: string): Promise<DownloadFile> {
    const job = await this.findJob(id);
    if (!job.errorReportStorageKey) throw Errors.notFound();
    try {
      const bytes = await this.storage.getObject(job.errorReportStorageKey, { maxBytes: 200 * MB });
      return { filename: `import-${job.id.slice(0, 8)}-issues.xlsx`, bytes };
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw Errors.notFound();
      throw error;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Steps
  // ------------------------------------------------------------------------------------------

  async saveMapping(id: string, mapping: ImportMapping, actorUserId: string): Promise<ImportJob> {
    const job = await this.findJob(id);
    if (job.status !== 'MAPPING' && job.status !== 'VALIDATED')
      throw notNow(job, 'change the column mapping');
    const problems = [
      ...validateStudentMapping(mapping, parseSheets(job.sheets)),
      ...(await this.mappingReferenceProblems(mapping)),
    ];
    if (problems.length > 0) throw Errors.validation(problems);

    await this.prisma.client.$transaction(async (tx) => {
      if (job.status === 'VALIDATED') {
        // A new mapping invalidates the validation: back to MAPPING, staging rows discarded.
        await this.requireTransition(tx, id, {
          from: ['VALIDATED'],
          to: 'MAPPING',
          data: {
            mapping,
            worksheetName: mapping.worksheet,
            totalRows: 0,
            validRows: 0,
            warningRows: 0,
            errorRows: 0,
            createRows: 0,
            updateRows: 0,
            unchangedRows: 0,
            validatedAt: null,
            errorReportStorageKey: null,
            errorReportCreatedAt: null,
            progress: 0,
          },
        });
        await tx.importRow.deleteMany({ where: { importJobId: id } });
      } else {
        const updated = await tx.importJob.updateMany({
          where: { id, status: 'MAPPING' },
          data: { mapping, worksheetName: mapping.worksheet },
        });
        if (updated.count !== 1)
          throw stateConflict('This import changed meanwhile. Reload and try again.');
      }
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentImportMappingSaved,
          entityType: 'ImportJob',
          entityId: id,
          metadata: {
            importJobId: id,
            mappedFields: Object.entries(mapping.columns)
              .filter(([, column]) => column !== null)
              .map(([field]) => field),
            dateFormat: mapping.dateFormat,
          },
        },
        tx,
      );
    });
    if (job.status === 'VALIDATED' && job.errorReportStorageKey) {
      await this.storage.deleteObject(job.errorReportStorageKey).catch(() => undefined);
    }
    return this.get(id);
  }

  /** Every record a value map or the default session points at must exist (and be usable). */
  private async mappingReferenceProblems(
    mapping: ImportMapping,
  ): Promise<{ path: string; message: string }[]> {
    const maps = mapping.valueMaps;
    const programIds = Object.values(maps.programCode ?? {});
    const departmentIds = Object.values(maps.departmentCode ?? {}).filter(
      (id): id is string => id !== null,
    );
    const sessionIds = [
      ...Object.values(maps.academicSessionCode ?? {}),
      ...(mapping.defaultAcademicSessionId ? [mapping.defaultAcademicSessionId] : []),
    ];
    const client = this.prisma.client;
    const [programs, departments, sessions] = await Promise.all([
      client.program.findMany({ where: { id: { in: programIds } }, select: { id: true } }),
      client.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true } }),
      client.academicSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, status: true },
      }),
    ]);
    const known = (rows: { id: string }[]) => new Set(rows.map((row) => row.id));
    const problems: { path: string; message: string }[] = [];
    const check = (
      field: string,
      entries: [string, string | null][],
      ids: Set<string>,
      what: string,
    ) => {
      for (const [value, id] of entries) {
        if (id !== null && !ids.has(id)) {
          problems.push({
            path: `valueMaps.${field}.${value}`,
            message: `Choose an existing ${what} for "${value}".`,
          });
        }
      }
    };
    check('programCode', Object.entries(maps.programCode ?? {}), known(programs), 'program');
    check(
      'departmentCode',
      Object.entries(maps.departmentCode ?? {}),
      known(departments),
      'department',
    );
    check(
      'academicSessionCode',
      Object.entries(maps.academicSessionCode ?? {}),
      known(sessions),
      'academic session',
    );
    if (mapping.defaultAcademicSessionId) {
      const session = sessions.find(
        (candidate) => candidate.id === mapping.defaultAcademicSessionId,
      );
      if (!session) {
        problems.push({
          path: 'defaultAcademicSessionId',
          message: 'Choose an existing academic session.',
        });
      } else if (session.status === 'ARCHIVED') {
        problems.push({
          path: 'defaultAcademicSessionId',
          message: 'This academic session is archived. Choose another session.',
        });
      }
    }
    return problems;
  }

  async validate(id: string, actorUserId: string): Promise<ImportJob> {
    const job = await this.findJob(id);
    if (job.status !== 'MAPPING' && job.status !== 'VALIDATED') throw notNow(job, 'be validated');
    const mapping = parseMapping(job.mapping);
    if (!mapping) {
      throw Errors.validation([
        { path: 'mapping', message: 'Save the column mapping before validating.' },
      ]);
    }
    const problems = validateStudentMapping(mapping, parseSheets(job.sheets));
    if (problems.length > 0) throw Errors.validation(problems);

    const runId = randomUUID();
    await this.requireTransition(this.prisma.client, id, {
      from: [job.status],
      to: 'VALIDATING',
      data: { activeRunId: runId, progress: 0 },
    });
    await this.enqueue(id, 'VALIDATING', IMPORT_JOB_NAMES.validate, runId, actorUserId);
    return this.get(id);
  }

  async commit(id: string, input: CommitImport, actorUserId: string): Promise<ImportJob> {
    const job = await this.findJob(id);
    if (job.status !== 'VALIDATED') throw notNow(job, 'be imported');
    const toImport = job.createRows + (input.applyUpdates ? job.updateRows : 0);
    if (toImport === 0) {
      throw Errors.validation([
        {
          path: 'applyUpdates',
          message:
            job.updateRows > 0
              ? 'There are no new records. Approve the updates to apply them, or cancel the import.'
              : 'There is nothing to import: every row has errors or is unchanged.',
        },
      ]);
    }
    const runId = randomUUID();
    await this.prisma.client.$transaction(async (tx) => {
      await this.requireTransition(tx, id, {
        from: ['VALIDATED'],
        to: 'PROCESSING',
        data: {
          activeRunId: runId,
          progress: 0,
          applyUpdates: input.applyUpdates,
          committedByUserId: actorUserId,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentImportCommitRequested,
          entityType: 'ImportJob',
          entityId: id,
          metadata: {
            importJobId: id,
            applyUpdates: input.applyUpdates,
            createRows: job.createRows,
            updateRows: job.updateRows,
          },
        },
        tx,
      );
    });
    await this.enqueue(id, 'PROCESSING', IMPORT_JOB_NAMES.commit, runId, actorUserId);
    return this.get(id);
  }

  async cancel(id: string, actorUserId: string): Promise<ImportJob> {
    const job = await this.findJob(id);
    if (!importActions(job.status, parseFailure(job.failure)).cancel)
      throw notNow(job, 'be cancelled');
    await this.prisma.client.$transaction(async (tx) => {
      // Clearing the run id makes any in-flight worker step stop without writing.
      await this.requireTransition(tx, id, {
        from: [job.status],
        to: 'CANCELLED',
        data: { activeRunId: null, cancelledAt: new Date() },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentImportCancelled,
          entityType: 'ImportJob',
          entityId: id,
          metadata: { importJobId: id, from: job.status, totalRows: job.totalRows },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async retry(id: string, actorUserId: string): Promise<ImportJob> {
    const job = await this.findJob(id);
    const failure = parseFailure(job.failure);
    if (job.status !== 'FAILED' || !failure?.retryable) {
      throw stateConflict(
        job.status === 'FAILED'
          ? 'This import failed because of the file itself; retrying cannot help. Start a new import with a corrected file.'
          : `This import is ${STATUS_WORDS[job.status]}; only failed imports can be retried.`,
      );
    }
    const target = retryTarget(failure);
    if (target === 'VALIDATING' && !parseMapping(job.mapping))
      throw stateConflict('This import has no column mapping.');
    const runId = randomUUID();
    await this.prisma.client.$transaction(async (tx) => {
      await this.requireTransition(tx, id, {
        from: ['FAILED'],
        to: target,
        data: { activeRunId: runId, failure: Prisma.DbNull, progress: 0 },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentImportRetried,
          entityType: 'ImportJob',
          entityId: id,
          metadata: { importJobId: id, stage: failure.stage },
        },
        tx,
      );
    });
    const name =
      target === 'UPLOADED'
        ? IMPORT_JOB_NAMES.parse
        : target === 'VALIDATING'
          ? IMPORT_JOB_NAMES.validate
          : IMPORT_JOB_NAMES.commit;
    await this.enqueue(id, target, name, runId, actorUserId);
    return this.get(id);
  }

  private async requireTransition(
    db: Prisma.TransactionClient | PrismaService['client'],
    id: string,
    options: Parameters<typeof transitionImportJob>[2],
  ): Promise<void> {
    try {
      if (!(await transitionImportJob(db, id, options))) {
        throw stateConflict(
          'This import changed while the request was processed. Reload and try again.',
        );
      }
    } catch (error) {
      if (error instanceof ImportStateError) throw stateConflict(error.message);
      throw error;
    }
  }
}
