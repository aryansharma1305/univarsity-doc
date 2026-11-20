import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type ObjectStorage, ObjectNotFoundError, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  HISTORICAL_DOCUMENT_RULES,
  type DocumentDisposition,
  type StudentUpload,
  type StudentUploadCategory,
  type StudentUploadList,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { UploadedDocument } from '../historical-documents/document-upload.interceptor.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import { processStudentUpload } from './student-upload-file.js';

const ENTITY = 'StudentUpload';

export interface UploadFile {
  bytes: Uint8Array;
  contentType: string;
  disposition: DocumentDisposition;
  filename: string;
}

interface Row {
  id: string;
  category: StudentUploadCategory;
  contentType: string;
  sizeBytes: number;
  updatedAt: Date;
}

const view = (row: Row): StudentUpload => ({
  id: row.id,
  category: row.category,
  contentType: row.contentType as StudentUpload['contentType'],
  sizeBytes: row.sizeBytes,
  uploadedAt: row.updatedAt.toISOString(),
});

const SELECT = {
  id: true,
  category: true,
  contentType: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

const storageUnavailable = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_CODES.serviceUnavailable,
    'File storage is temporarily unavailable. Nothing was changed; please try again shortly.',
  );

/**
 * Student uploads: the owning student uploads, replaces, deletes and reads their own files (the
 * student always comes from the session); staff with `studentUploads.read` list and download them.
 * Audit metadata holds IDs and the category only — never file contents, names or ID numbers.
 */
@Injectable()
export class StudentUploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private async throttle(scope: string, principal: string, limit: number, windowSeconds: number) {
    const result = await this.limiter.hit(
      scope,
      [{ key: this.hasher.hash(scope, principal), limit }],
      windowSeconds,
    );
    if (result.limited) {
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.authRateLimited,
        'Too many document actions. Please wait before trying again.',
        { headers: { 'Retry-After': String(Math.max(1, result.retryAfterSeconds)) } },
      );
    }
  }

  async listOwn(studentId: string): Promise<StudentUploadList> {
    const rows = await this.prisma.client.studentUpload.findMany({
      where: { studentId },
      select: SELECT,
      orderBy: { category: 'asc' },
    });
    return { data: rows.map(view) };
  }

  /** Upload or replace the student's file for one category. */
  async save(
    studentId: string,
    accountId: string,
    category: StudentUploadCategory,
    file: UploadedDocument | undefined,
  ): Promise<StudentUpload> {
    await this.throttle('student-upload-write', accountId, 20, 3600);
    if (!file || file.size === 0) {
      throw Errors.validation([{ path: 'file', message: 'Choose a PDF, JPEG or PNG file.' }]);
    }
    const processed = await processStudentUpload(
      new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
      file.mimetype,
    );
    const key = objectKeys.studentUpload(studentId, processed.extension);
    try {
      await this.storage.putObject(key, processed.bytes, { contentType: processed.contentType });
    } catch {
      throw storageUnavailable();
    }
    try {
      const { row: saved, previousKey } = await this.prisma.client.$transaction(async (tx) => {
        // Serialises concurrent uploads of the same student so the replaced object is known.
        await tx.$queryRaw`SELECT id FROM students WHERE id = ${studentId}::uuid FOR UPDATE`;
        const existing = await tx.studentUpload.findUnique({
          where: { studentId_category: { studentId, category } },
          select: { id: true, storageKey: true },
        });
        const data = {
          storageKey: key,
          contentType: processed.contentType,
          sizeBytes: processed.bytes.byteLength,
          sha256: processed.sha256,
        };
        const row = existing
          ? await tx.studentUpload.update({ where: { id: existing.id }, data, select: SELECT })
          : await tx.studentUpload.create({
              data: { studentId, category, ...data },
              select: SELECT,
            });
        await this.audit.writeAuditEvent(
          {
            actorUserId: null,
            action: AUDIT_ACTIONS.studentUploadSaved,
            entityType: ENTITY,
            entityId: row.id,
            metadata: { studentId, accountId, category, replaced: existing !== null },
          },
          tx,
        );
        return { row, previousKey: existing?.storageKey ?? null };
      });
      // shortcut: a failed cleanup leaves an unreferenced private object; add a sweep if it matters.
      if (previousKey) await this.storage.deleteObject(previousKey).catch(() => undefined);
      return view(saved);
    } catch (error) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw error;
    }
  }

  async remove(studentId: string, accountId: string, category: StudentUploadCategory) {
    await this.throttle('student-upload-write', accountId, 20, 3600);
    const removed = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.studentUpload.findUnique({
        where: { studentId_category: { studentId, category } },
        select: { id: true, storageKey: true },
      });
      if (!row) throw Errors.notFound();
      await tx.studentUpload.delete({ where: { id: row.id } });
      await this.audit.writeAuditEvent(
        {
          actorUserId: null,
          action: AUDIT_ACTIONS.studentUploadDeleted,
          entityType: ENTITY,
          entityId: row.id,
          metadata: { studentId, accountId, category },
        },
        tx,
      );
      return row;
    });
    // shortcut: a failed cleanup leaves an unreferenced private object; add a sweep if it matters.
    await this.storage.deleteObject(removed.storageKey).catch(() => undefined);
  }

  async ownFile(
    studentId: string,
    accountId: string,
    category: StudentUploadCategory,
    disposition: DocumentDisposition,
  ): Promise<UploadFile> {
    await this.throttle('student-upload-read', accountId, 60, 60);
    const row = await this.prisma.client.studentUpload.findUnique({
      where: { studentId_category: { studentId, category } },
    });
    if (!row) throw Errors.notFound();
    return this.read(row, disposition);
  }

  async staffList(studentId: string, userId: string): Promise<StudentUploadList> {
    await this.throttle('staff-student-uploads', userId, 120, 60);
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw Errors.notFound();
    const list = await this.listOwn(studentId);
    await this.audit.writeAuditEvent({
      actorUserId: userId,
      action: AUDIT_ACTIONS.studentUploadsViewed,
      entityType: 'Student',
      entityId: studentId,
      metadata: { studentId, uploadIds: list.data.map((item) => item.id) },
    });
    return list;
  }

  async staffFile(
    studentId: string,
    id: string,
    disposition: DocumentDisposition,
    userId: string,
  ): Promise<UploadFile> {
    await this.throttle('staff-student-uploads', userId, 120, 60);
    const row = await this.prisma.client.studentUpload.findFirst({ where: { id, studentId } });
    if (!row) throw Errors.notFound();
    const file = await this.read(row, disposition);
    await this.audit.writeAuditEvent({
      actorUserId: userId,
      action: AUDIT_ACTIONS.studentUploadDownloaded,
      entityType: ENTITY,
      entityId: row.id,
      metadata: { studentId, category: row.category, disposition },
    });
    return file;
  }

  private async read(
    row: { storageKey: string; contentType: string; category: StudentUploadCategory },
    disposition: DocumentDisposition,
  ): Promise<UploadFile> {
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.getObject(row.storageKey, {
        maxBytes: HISTORICAL_DOCUMENT_RULES.maxBytes,
      });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw Errors.notFound();
      throw storageUnavailable();
    }
    const extension =
      row.contentType === 'application/pdf'
        ? 'pdf'
        : row.contentType === 'image/png'
          ? 'png'
          : 'jpg';
    return {
      bytes,
      contentType: row.contentType,
      disposition,
      filename: `${row.category.toLowerCase().replaceAll('_', '-')}.${extension}`,
    };
  }
}
