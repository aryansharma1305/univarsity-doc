import { createHash } from 'node:crypto';
import type { PrismaClient } from '@docversity/database';
import { type ObjectStorage, ObjectNotFoundError, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS } from '@docversity/types';
import { documentReference } from '@docversity/validation';
import { createStudentCopy, type ImageContentType } from './student-copy.js';

export type BackfillOutcome =
  | 'CREATED'
  | 'WOULD_CREATE'
  | 'ALREADY_DONE'
  | 'ORIGINAL_MISSING'
  | 'ORIGINAL_CHANGED'
  | 'SANITIZATION_FAILED'
  | 'STORAGE_ERROR'
  | 'DATABASE_ERROR';

export interface BackfillItem {
  id: string;
  reference: string;
  outcome: BackfillOutcome;
}

export interface BackfillReport {
  examined: number;
  items: BackfillItem[];
  /** True when any document could not be given a copy (it stays unavailable to its student). */
  failed: boolean;
}

const MAX_READ_BYTES = 20 * 1024 * 1024;
const FAILURES: readonly BackfillOutcome[] = [
  'ORIGINAL_MISSING',
  'ORIGINAL_CHANGED',
  'SANITIZATION_FAILED',
  'STORAGE_ERROR',
  'DATABASE_ERROR',
];

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Creates the missing student copies of image documents (uploaded before the Phase 8 hardening).
 *
 * Safe to repeat and to run while the API is serving: originals are only READ (and must still match
 * their recorded SHA-256 — altered evidence is reported, never used); each copy is a NEW object
 * under a new key; the row is updated under a row lock only if it still has no copy, otherwise the
 * new object is removed again. Superseded documents are never shown to students and are skipped.
 * With `dryRun`, copies are produced and checked in memory but nothing is stored or changed.
 */
export async function backfillStudentCopies(
  db: PrismaClient,
  storage: ObjectStorage,
  options: { dryRun?: boolean; batchSize?: number } = {},
): Promise<BackfillReport> {
  const batchSize = options.batchSize ?? 50;
  const items: BackfillItem[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await db.historicalDocument.findMany({
      where: {
        contentType: { in: ['image/jpeg', 'image/png'] },
        studentCopyStorageKey: null,
        status: { not: 'SUPERSEDED' },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        studentRegistrationId: true,
        storageKey: true,
        contentType: true,
        sha256: true,
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (batch.length === 0) break;
    cursor = batch.at(-1)?.id;
    for (const doc of batch) {
      const outcome = await backfillOne(db, storage, doc, options.dryRun ?? false);
      items.push({ id: doc.id, reference: documentReference(doc.id), outcome });
    }
  }
  return {
    examined: items.length,
    items,
    failed: items.some((item) => FAILURES.includes(item.outcome)),
  };
}

async function backfillOne(
  db: PrismaClient,
  storage: ObjectStorage,
  doc: {
    id: string;
    studentRegistrationId: string;
    storageKey: string;
    contentType: string;
    sha256: string;
  },
  dryRun: boolean,
): Promise<BackfillOutcome> {
  let original: Uint8Array;
  try {
    original = await storage.getObject(doc.storageKey, { maxBytes: MAX_READ_BYTES });
  } catch (error) {
    return error instanceof ObjectNotFoundError ? 'ORIGINAL_MISSING' : 'STORAGE_ERROR';
  }
  if (sha256Of(original) !== doc.sha256) return 'ORIGINAL_CHANGED';
  let copy;
  try {
    copy = await createStudentCopy(original, doc.contentType as ImageContentType);
  } catch {
    return 'SANITIZATION_FAILED';
  }
  if (dryRun) return 'WOULD_CREATE';

  const key = objectKeys.historicalDocumentStudentCopy(doc.studentRegistrationId, copy.extension);
  try {
    await storage.putObject(key, copy.bytes, { contentType: copy.contentType });
  } catch {
    return 'STORAGE_ERROR';
  }
  try {
    const recorded = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM historical_documents WHERE id = ${doc.id}::uuid FOR UPDATE`;
      const current = await tx.historicalDocument.findUnique({
        where: { id: doc.id },
        select: { studentCopyStorageKey: true, status: true },
      });
      // Gone, already given a copy meanwhile, or superseded: nothing to record.
      if (current?.studentCopyStorageKey !== null || current.status === 'SUPERSEDED') {
        return false;
      }
      await tx.historicalDocument.update({
        where: { id: doc.id },
        data: {
          studentCopyStorageKey: key,
          studentCopyContentType: copy.contentType,
          studentCopySizeBytes: copy.sizeBytes,
          studentCopySha256: copy.sha256,
          studentCopyCreatedAt: new Date(),
          embeddedMetadata: copy.embeddedMetadata,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: AUDIT_ACTIONS.historicalDocumentStudentCopyCreated,
          entityType: 'HistoricalDocument',
          entityId: doc.id,
          // Kinds of metadata only — never the values.
          metadata: {
            source: 'backfill',
            studentCopySha256: copy.sha256,
            sizeBytes: copy.sizeBytes,
            embeddedMetadata: copy.embeddedMetadata,
          },
        },
      });
      return true;
    });
    if (!recorded) {
      await storage.deleteObject(key).catch(() => undefined);
      return 'ALREADY_DONE';
    }
    return 'CREATED';
  } catch {
    await storage.deleteObject(key).catch(() => undefined);
    return 'DATABASE_ERROR';
  }
}
