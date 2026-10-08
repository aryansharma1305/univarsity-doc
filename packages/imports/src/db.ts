import { Prisma, type PrismaClient } from '@docversity/database';
import type { AuditAction } from '@docversity/types';
import type { ImportStatus } from '@docversity/validation';
import { ImportStateError, StaleImportRunError } from './errors.js';
import { assertTransition } from './state-machine.js';
import type { ExistingRegistration, ReferenceData } from './student-rows.js';

export type Db = PrismaClient | Prisma.TransactionClient;

const LOOKUP_CHUNK = 1_000;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

export { chunks };

export function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function fromDateOnly(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

// ----------------------------------------------------------------------------------------------
// Reference data and existing records (bulk, chunked — never one query per row)
// ----------------------------------------------------------------------------------------------

export async function loadReferenceData(db: Db): Promise<ReferenceData> {
  const [programs, sessions, departments] = await Promise.all([
    db.program.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        department: { select: { id: true, code: true, status: true } },
      },
    }),
    db.academicSession.findMany({ select: { id: true, code: true, name: true, status: true } }),
    db.department.findMany({ select: { id: true, code: true, name: true, status: true } }),
  ]);
  return { programs, sessions, departments };
}

const existingSelect = {
  id: true,
  studentId: true,
  registrationNumber: true,
  registrationNumberNormalized: true,
  rollReferenceNumber: true,
  admissionDate: true,
  completionDate: true,
  status: true,
  program: { select: { id: true, code: true } },
  department: { select: { id: true, code: true } },
  academicSession: { select: { id: true, code: true } },
  student: {
    select: { fullName: true, fatherName: true, motherName: true, dateOfBirth: true, gender: true },
  },
} as const;

type ExistingRow = Prisma.StudentRegistrationGetPayload<{ select: typeof existingSelect }>;

function toExisting(row: ExistingRow): ExistingRegistration {
  return {
    id: row.id,
    studentId: row.studentId,
    registrationNumber: row.registrationNumber,
    registrationNumberNormalized: row.registrationNumberNormalized,
    rollReferenceNumber: row.rollReferenceNumber,
    program: row.program,
    department: row.department,
    academicSession: row.academicSession,
    admissionDate: dateOnly(row.admissionDate),
    completionDate: dateOnly(row.completionDate),
    status: row.status,
    student: { ...row.student, dateOfBirth: dateOnly(row.student.dateOfBirth) },
  };
}

/** Existing registrations by normalised registration number. */
export async function loadExistingRegistrations(
  db: Db,
  normalizedNumbers: readonly string[],
): Promise<Map<string, ExistingRegistration>> {
  const result = new Map<string, ExistingRegistration>();
  for (const chunk of chunks([...new Set(normalizedNumbers)], LOOKUP_CHUNK)) {
    const rows = await db.studentRegistration.findMany({
      where: { registrationNumberNormalized: { in: chunk } },
      select: existingSelect,
    });
    for (const row of rows) result.set(row.registrationNumberNormalized, toExisting(row));
  }
  return result;
}

export async function loadExistingRegistrationsById(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, ExistingRegistration>> {
  const result = new Map<string, ExistingRegistration>();
  for (const chunk of chunks([...new Set(ids)], LOOKUP_CHUNK)) {
    const rows = await db.studentRegistration.findMany({
      where: { id: { in: chunk } },
      select: existingSelect,
    });
    for (const row of rows) result.set(row.id, toExisting(row));
  }
  return result;
}

/** Registrations using the given roll/reference numbers (case-insensitive), as rollKey → numbers. */
export async function loadRollIndex(
  db: Db,
  rolls: readonly string[],
): Promise<Map<string, Set<string>>> {
  const index = new Map<string, Set<string>>();
  const upper = [...new Set(rolls.map((roll) => roll.trim().toUpperCase()))];
  for (const chunk of chunks(upper, LOOKUP_CHUNK)) {
    const rows = await db.$queryRaw<
      { normalized: string; program_id: string; academic_session_id: string; roll: string }[]
    >`SELECT registration_number_normalized AS normalized, program_id::text AS program_id,
             academic_session_id::text AS academic_session_id, upper(btrim(roll_reference_number)) AS roll
        FROM student_registrations
       WHERE upper(btrim(roll_reference_number)) = ANY(${chunk}::text[])`;
    for (const row of rows) {
      const key = `${row.program_id}|${row.academic_session_id}|${row.roll}`;
      index.set(key, new Set([...(index.get(key) ?? []), row.normalized]));
    }
  }
  return index;
}

// ----------------------------------------------------------------------------------------------
// Job state: compare-and-set transitions, run ownership, progress
// ----------------------------------------------------------------------------------------------

export interface TransitionOptions {
  from: readonly ImportStatus[];
  to: ImportStatus;
  /** When set, the job must currently be owned by this worker run. */
  runId?: string;
  data?: Prisma.ImportJobUncheckedUpdateManyInput;
}

/**
 * Applies a status change only if the job is still in one of the expected statuses (and, for worker
 * writes, still owned by the run). Returns false when another request or run got there first.
 */
export async function transitionImportJob(
  db: Db,
  id: string,
  options: TransitionOptions,
): Promise<boolean> {
  assertTransition(options.from, options.to);
  const result = await db.importJob.updateMany({
    where: {
      id,
      status: { in: [...options.from] },
      ...(options.runId ? { activeRunId: options.runId } : {}),
    },
    data: { ...options.data, status: options.to },
  });
  return result.count === 1;
}

export async function requireTransition(
  db: Db,
  id: string,
  options: TransitionOptions,
): Promise<void> {
  if (!(await transitionImportJob(db, id, options))) {
    throw new ImportStateError(
      'This import changed while the request was processed. Reload and try again.',
    );
  }
}

/**
 * Locks the job row for the rest of the transaction and checks this run still owns it. Serialises
 * duplicate deliveries of the same job and protects against cancellation races.
 */
export async function lockRun(
  tx: Prisma.TransactionClient,
  id: string,
  status: ImportStatus,
  runId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ status: string; active_run_id: string | null }[]>`
    SELECT status::text AS status, active_run_id::text AS active_run_id
      FROM import_jobs WHERE id = ${id}::uuid FOR UPDATE`;
  const job = rows[0];
  if (job?.status !== status || job.active_run_id !== runId) throw new StaleImportRunError();
}

/** Persists progress (0–100) of the current run; stops the run if it no longer owns the job. */
export async function setProgress(
  db: Db,
  id: string,
  status: ImportStatus,
  runId: string,
  progress: number,
): Promise<void> {
  const result = await db.importJob.updateMany({
    where: { id, status, activeRunId: runId },
    data: { progress: Math.max(0, Math.min(100, Math.round(progress))) },
  });
  if (result.count !== 1) throw new StaleImportRunError();
}

// ----------------------------------------------------------------------------------------------
// Counts (always derived from the rows, so they are correct after retries)
// ----------------------------------------------------------------------------------------------

export interface RowCounts {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  createRows: number;
  updateRows: number;
  unchangedRows: number;
  importedRows: number;
  skippedRows: number;
  createdRecords: number;
  updatedRecords: number;
}

export async function computeRowCounts(db: Db, importJobId: string): Promise<RowCounts> {
  const [byStatusAction, withWarnings] = await Promise.all([
    db.importRow.groupBy({
      by: ['status', 'action'],
      where: { importJobId },
      _count: { _all: true },
    }),
    db.importRow.count({
      where: { importJobId, status: { not: 'ERROR' }, warnings: { not: Prisma.AnyNull } },
    }),
  ]);
  let total = 0;
  let errors = 0;
  let create = 0;
  let update = 0;
  let unchanged = 0;
  let imported = 0;
  let skipped = 0;
  let created = 0;
  let updated = 0;
  for (const group of byStatusAction) {
    const count = group._count._all;
    total += count;
    if (group.status === 'ERROR') {
      errors += count;
      continue;
    }
    if (group.action === 'CREATE') create += count;
    if (group.action === 'UPDATE') update += count;
    if (group.action === 'SKIP') unchanged += count;
    if (group.status === 'IMPORTED') {
      imported += count;
      if (group.action === 'CREATE') created += count;
      if (group.action === 'UPDATE') updated += count;
    }
    if (group.status === 'SKIPPED') skipped += count;
  }
  return {
    totalRows: total,
    validRows: total - errors - withWarnings,
    warningRows: withWarnings,
    errorRows: errors,
    createRows: create,
    updateRows: update,
    unchangedRows: unchanged,
    importedRows: imported,
    skippedRows: skipped,
    createdRecords: created,
    updatedRecords: updated,
  };
}

// ----------------------------------------------------------------------------------------------
// Audit (append-only table; metadata holds IDs and counts — never spreadsheet content)
// ----------------------------------------------------------------------------------------------

export interface ImportAuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, string | number | boolean | null | string[]>;
  correlationId: string | null;
}

export async function appendAudit(db: Db, entries: readonly ImportAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.auditLog.createMany({
    data: entries.map((entry) => ({
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
      correlationId: entry.correlationId,
    })),
  });
}
