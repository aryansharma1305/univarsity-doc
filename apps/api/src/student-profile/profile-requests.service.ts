import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type Prisma, uniqueConstraintName } from '@docversity/database';
import { type ObjectStorage, ObjectNotFoundError, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS, type AuditAction } from '@docversity/types';
import {
  type ActivityItem,
  ERROR_CODES,
  normalizeRegistrationNumber,
  PROFILE_FIELD_LABELS,
  PROFILE_REQUEST_FIELDS,
  type ProfileChanges,
  type ProfilePhotoVariant,
  type ProfileRequestDetail,
  type ProfileRequestField,
  type ProfileRequestList,
  type ProfileRequestQuery,
  type ProfileRequestRow,
  type RejectProfileRequest,
  type StudentProfileRequest,
  type StudentProfileRequestList,
  type SubmitProfileRequest,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { toDateOnly } from '../common/dates.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import { imageContentType, processProfilePhoto } from './profile-photo.js';
import type { UploadedPhoto } from './photo-upload.interceptor.js';

const ENTITY = 'StudentProfileChangeRequest';
const PENDING_INDEX = 'student_profile_change_requests_one_pending_per_student_key';
/** Upper bound when reading a stored photo back (stored photos are ≤ ~1 MB JPEGs). */
const MAX_PHOTO_READ_BYTES = 10 * 1024 * 1024;

/** Official values of the request fields, as strings ("YYYY-MM-DD" for the date). */
export type ProfileSnapshot = Record<ProfileRequestField, string | null>;

interface StudentRow {
  fullName: string;
  fatherName: string | null;
  motherName: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  photoStorageKey: string | null;
}

export function snapshotOf(student: StudentRow): ProfileSnapshot {
  return {
    fullName: student.fullName,
    fatherName: student.fatherName,
    motherName: student.motherName,
    gender: student.gender,
    dateOfBirth: toDateOnly(student.dateOfBirth),
  };
}

function proposedOf(value: Prisma.JsonValue): Partial<Record<ProfileRequestField, string>> {
  const out: Partial<Record<ProfileRequestField, string>> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const field of PROFILE_REQUEST_FIELDS) {
      const item = value[field];
      if (typeof item === 'string') out[field] = item;
    }
  }
  return out;
}

function snapshotFromJson(value: Prisma.JsonValue): ProfileSnapshot {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const read = (field: ProfileRequestField) => {
    const item = record[field];
    return typeof item === 'string' ? item : null;
  };
  return {
    fullName: read('fullName'),
    fatherName: read('fatherName'),
    motherName: read('motherName'),
    gender: read('gender'),
    dateOfBirth: read('dateOfBirth'),
  };
}

const conflict = (code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string) =>
  new AppError(HttpStatus.CONFLICT, code, message);

const pendingExists = () =>
  conflict(
    ERROR_CODES.profileRequestPending,
    'You already have a request waiting for review. Cancel it or wait for a decision before submitting another.',
  );

const notPending = () =>
  conflict(
    ERROR_CODES.profileRequestNotPending,
    'This request has already been decided or cancelled.',
  );

const storageUnavailable = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_CODES.serviceUnavailable,
    'Photo storage is temporarily unavailable. Nothing was submitted; please try again shortly.',
  );

const requestInclude = {
  student: {
    select: {
      id: true,
      fullName: true,
      registrations: { select: { registrationNumber: true }, orderBy: { createdAt: 'desc' } },
    },
  },
  reviewedBy: { select: { id: true, displayName: true } },
} as const;

type RequestWithRelations = Prisma.StudentProfileChangeRequestGetPayload<{
  include: typeof requestInclude;
}>;

const ACTION_SUMMARIES: Partial<Record<AuditAction, string>> = {
  STUDENT_PROFILE_REQUEST_SUBMITTED: 'Submitted by the student',
  STUDENT_PROFILE_REQUEST_CANCELLED: 'Cancelled by the student',
  STUDENT_PROFILE_REQUEST_APPROVED: 'Approved; official record updated',
  STUDENT_PROFILE_REQUEST_REJECTED: 'Rejected',
};

/**
 * Phase 7: student profile change requests. Students submit/cancel their own requests (identity from
 * the session only); staff approve or reject. The official `students` row changes only on approval,
 * after re-checking — under row locks — that the values the student saw are still the official ones.
 */
@Injectable()
export class ProfileRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Student side
  // ------------------------------------------------------------------------------------------

  async submit(
    studentId: string,
    accountId: string,
    body: SubmitProfileRequest,
    file: UploadedPhoto | undefined,
  ): Promise<StudentProfileRequest> {
    const student = await this.prisma.client.student.findUnique({ where: { id: studentId } });
    if (!student) throw Errors.sessionExpired();
    const current = snapshotOf(student);
    const changes = this.checkChanges(body.changes, current);
    const hasPhoto = file !== undefined && file.size > 0;
    if (Object.keys(changes).length === 0 && !hasPhoto) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.profileRequestNoChanges,
        'Change at least one detail or add a photo before submitting.',
      );
    }
    // Cheap early refusal; the partial unique index is the authority (checked again on insert).
    const open = await this.prisma.client.studentProfileChangeRequest.count({
      where: { studentId, status: 'PENDING' },
    });
    if (open > 0) throw pendingExists();

    const photo = hasPhoto
      ? await processProfilePhoto(
          new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
          file.mimetype,
        )
      : undefined;
    const photoKey = photo ? objectKeys.profileRequestPhoto(studentId) : null;
    if (photo && photoKey) {
      try {
        await this.storage.putObject(photoKey, photo.bytes, { contentType: 'image/jpeg' });
      } catch {
        throw storageUnavailable();
      }
    }

    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        // Snapshot inside the transaction: approval compares against exactly these values.
        const fresh = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
        const request = await tx.studentProfileChangeRequest.create({
          data: {
            studentId,
            submittedByAccountId: accountId,
            proposedChanges: changes,
            currentSnapshot: snapshotOf(fresh),
            studentNote: body.note ?? null,
            basePhotoStorageKey: fresh.photoStorageKey,
            ...(photo && photoKey
              ? {
                  photoStorageKey: photoKey,
                  photoSha256: createHash('sha256').update(photo.bytes).digest('hex'),
                  photoSizeBytes: photo.bytes.byteLength,
                  photoWidth: photo.width,
                  photoHeight: photo.height,
                }
              : {}),
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId: null,
            action: AUDIT_ACTIONS.studentProfileRequestSubmitted,
            entityType: ENTITY,
            entityId: request.id,
            metadata: {
              studentId,
              accountId,
              fields: Object.keys(changes),
              hasPhoto: photo !== undefined,
            },
          },
          tx,
        );
        return request;
      });
      return this.toStudentView(created);
    } catch (error) {
      if (photoKey) await this.storage.deleteObject(photoKey).catch(() => undefined);
      if (uniqueConstraintName(error) === PENDING_INDEX) throw pendingExists();
      throw error;
    }
  }

  /** Drops nothing silently: unchanged values and disallowed DOB corrections are field errors. */
  private checkChanges(changes: ProfileChanges, current: ProfileSnapshot): ProfileChanges {
    const details: { path: string; message: string }[] = [];
    for (const field of PROFILE_REQUEST_FIELDS) {
      const value = changes[field];
      if (value === undefined) continue;
      if (value === current[field]) {
        details.push({
          path: `changes.${field}`,
          message: `${PROFILE_FIELD_LABELS[field]} is already this value on your record.`,
        });
      }
    }
    if (changes.dateOfBirth !== undefined && current.dateOfBirth !== null) {
      details.push({
        path: 'changes.dateOfBirth',
        message:
          'Your date of birth is already on record. Contact the registrar’s office to correct it.',
      });
    }
    if (details.length > 0) throw Errors.validation(details);
    return changes;
  }

  async listOwn(studentId: string): Promise<StudentProfileRequestList> {
    const requests = await this.prisma.client.studentProfileChangeRequest.findMany({
      where: { studentId },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });
    return { data: requests.map((request) => this.toStudentView(request)) };
  }

  async getOwn(studentId: string, id: string): Promise<StudentProfileRequest> {
    const request = await this.prisma.client.studentProfileChangeRequest.findFirst({
      where: { id, studentId },
    });
    if (!request) throw Errors.notFound();
    return this.toStudentView(request);
  }

  async cancelOwn(
    studentId: string,
    accountId: string,
    id: string,
  ): Promise<StudentProfileRequest> {
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const status = await this.lock(tx, id, studentId);
      if (status !== 'PENDING') throw notPending();
      const request = await tx.studentProfileChangeRequest.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: null,
          action: AUDIT_ACTIONS.studentProfileRequestCancelled,
          entityType: ENTITY,
          entityId: id,
          metadata: { studentId, accountId },
        },
        tx,
      );
      return request;
    });
    return this.toStudentView(updated);
  }

  private toStudentView(
    request: Prisma.StudentProfileChangeRequestGetPayload<object>,
  ): StudentProfileRequest {
    const proposed = proposedOf(request.proposedChanges);
    const previous = snapshotFromJson(request.currentSnapshot);
    return {
      id: request.id,
      status: request.status,
      submittedAt: request.submittedAt.toISOString(),
      decidedAt: (request.reviewedAt ?? request.cancelledAt)?.toISOString() ?? null,
      changes: PROFILE_REQUEST_FIELDS.flatMap((field) => {
        const value = proposed[field];
        return value === undefined ? [] : [{ field, previous: previous[field], proposed: value }];
      }),
      photo:
        request.photoStorageKey &&
        request.photoWidth &&
        request.photoHeight &&
        request.photoSizeBytes
          ? {
              width: request.photoWidth,
              height: request.photoHeight,
              sizeBytes: request.photoSizeBytes,
            }
          : null,
      note: request.studentNote,
      rejectionReason: request.rejectionReason,
    };
  }

  // ------------------------------------------------------------------------------------------
  // Staff side
  // ------------------------------------------------------------------------------------------

  async list(query: ProfileRequestQuery): Promise<ProfileRequestList> {
    const where: Prisma.StudentProfileChangeRequestWhereInput = {
      AND: [
        query.status ? { status: query.status } : {},
        query.search
          ? {
              student: {
                OR: [
                  { fullName: { contains: query.search, mode: 'insensitive' } },
                  {
                    registrations: {
                      some: {
                        registrationNumberNormalized: {
                          contains: normalizeRegistrationNumber(query.search),
                        },
                      },
                    },
                  },
                ],
              },
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.studentProfileChangeRequest.findMany({
        where,
        include: requestInclude,
        orderBy: [{ submittedAt: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.studentProfileChangeRequest.count({ where }),
    ]);
    return { data: rows.map((row) => this.toRow(row)), meta: paginationMeta(query, total) };
  }

  private toRow(request: RequestWithRelations): ProfileRequestRow {
    const proposed = proposedOf(request.proposedChanges);
    return {
      id: request.id,
      status: request.status,
      submittedAt: request.submittedAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      cancelledAt: request.cancelledAt?.toISOString() ?? null,
      student: { id: request.student.id, fullName: request.student.fullName },
      registrationNumbers: request.student.registrations.map((r) => r.registrationNumber),
      fields: PROFILE_REQUEST_FIELDS.filter((field) => proposed[field] !== undefined),
      hasPhoto: request.photoStorageKey !== null,
      reviewer: request.reviewedBy,
    };
  }

  async detail(id: string): Promise<ProfileRequestDetail> {
    const request = await this.prisma.client.studentProfileChangeRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!request) throw Errors.notFound();
    const [student, history, others] = await Promise.all([
      this.prisma.client.student.findUniqueOrThrow({ where: { id: request.studentId } }),
      this.prisma.client.auditLog.findMany({
        where: { entityType: ENTITY, entityId: id },
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { displayName: true } } },
        take: 50,
      }),
      this.prisma.client.studentProfileChangeRequest.findMany({
        where: { studentId: request.studentId, id: { not: id } },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, status: true, submittedAt: true },
        take: 20,
      }),
    ]);
    const proposed = proposedOf(request.proposedChanges);
    const previous = snapshotFromJson(request.currentSnapshot);
    const current = snapshotOf(student);
    const changes = PROFILE_REQUEST_FIELDS.flatMap((field) => {
      const value = proposed[field];
      if (value === undefined) return [];
      return [
        {
          field,
          previous: previous[field],
          proposed: value,
          current: current[field],
          changedSinceSubmission: current[field] !== previous[field],
        },
      ];
    });
    const photoChanged = student.photoStorageKey !== request.basePhotoStorageKey;
    const photo =
      request.photoStorageKey && request.photoWidth && request.photoHeight && request.photoSizeBytes
        ? {
            width: request.photoWidth,
            height: request.photoHeight,
            sizeBytes: request.photoSizeBytes,
            officialPhotoChangedSinceSubmission: photoChanged,
          }
        : null;
    return {
      ...this.toRow(request),
      changes,
      photo,
      hasOfficialPhoto: student.photoStorageKey !== null,
      stale:
        request.status === 'PENDING' &&
        (changes.some((change) => change.changedSinceSubmission) ||
          (photo !== null && photoChanged)),
      note: request.studentNote,
      rejectionReason: request.rejectionReason,
      history: history.map((entry): ActivityItem => ({
        id: entry.id,
        action: entry.action,
        summary: ACTION_SUMMARIES[entry.action as AuditAction] ?? entry.action,
        actor: entry.actor?.displayName ?? (entry.actorUserId ? null : 'Student'),
        createdAt: entry.createdAt.toISOString(),
      })),
      otherRequests: others.map((other) => ({
        id: other.id,
        status: other.status,
        submittedAt: other.submittedAt.toISOString(),
      })),
    };
  }

  async approve(id: string, actorUserId: string): Promise<ProfileRequestDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const status = await this.lock(tx, id);
      if (status !== 'PENDING') throw notPending();
      const request = await tx.studentProfileChangeRequest.findUniqueOrThrow({ where: { id } });
      // Lock the official record, then refuse if anything the student saw has changed since.
      await tx.$queryRaw`SELECT id FROM students WHERE id = ${request.studentId}::uuid FOR UPDATE`;
      const student = await tx.student.findUniqueOrThrow({ where: { id: request.studentId } });
      const proposed = proposedOf(request.proposedChanges);
      const previous = snapshotFromJson(request.currentSnapshot);
      const current = snapshotOf(student);
      const fields = PROFILE_REQUEST_FIELDS.filter((field) => proposed[field] !== undefined);
      const staleFields = fields.filter((field) => current[field] !== previous[field]);
      const photoStale =
        request.photoStorageKey !== null && student.photoStorageKey !== request.basePhotoStorageKey;
      if (staleFields.length > 0 || photoStale) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.profileRequestStale,
          'The official record changed after this request was submitted. Reject it and ask the student to submit a new request.',
          {
            details: [
              ...staleFields.map((field) => ({
                path: field,
                message: `${PROFILE_FIELD_LABELS[field]} changed after submission.`,
              })),
              ...(photoStale
                ? [{ path: 'photo', message: 'The official photo changed after submission.' }]
                : []),
            ],
          },
        );
      }

      const data: Prisma.StudentUpdateInput = {};
      if (proposed.fullName !== undefined) data.fullName = proposed.fullName;
      if (proposed.fatherName !== undefined) data.fatherName = proposed.fatherName;
      if (proposed.motherName !== undefined) data.motherName = proposed.motherName;
      if (proposed.gender !== undefined) data.gender = proposed.gender;
      if (proposed.dateOfBirth !== undefined) {
        data.dateOfBirth = new Date(`${proposed.dateOfBirth}T00:00:00.000Z`);
      }
      if (request.photoStorageKey !== null) data.photoStorageKey = request.photoStorageKey;
      await tx.student.update({ where: { id: student.id }, data });
      await tx.studentProfileChangeRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewedByUserId: actorUserId, reviewedAt: new Date() },
      });
      const changed = [...fields, ...(request.photoStorageKey !== null ? ['photo'] : [])];
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentProfileRequestApproved,
          entityType: ENTITY,
          entityId: id,
          metadata: { studentId: student.id, fields: changed },
        },
        tx,
      );
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentUpdated,
          entityType: 'Student',
          entityId: student.id,
          metadata: { fields: changed, source: 'profileRequest', profileRequestId: id },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  async reject(
    id: string,
    body: RejectProfileRequest,
    actorUserId: string,
  ): Promise<ProfileRequestDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const status = await this.lock(tx, id);
      if (status !== 'PENDING') throw notPending();
      const request = await tx.studentProfileChangeRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          rejectionReason: body.reason,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentProfileRequestRejected,
          // The reason is shown to the student from the request row; it is not copied to the log.
          entityType: ENTITY,
          entityId: id,
          metadata: { studentId: request.studentId },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Locks the request row (FOR UPDATE) and returns its status; scoped to a student when given. */
  private async lock(
    tx: Prisma.TransactionClient,
    id: string,
    studentId?: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ status: string; student_id: string }[]>`
      SELECT status::text AS status, student_id::text AS student_id
        FROM student_profile_change_requests WHERE id = ${id}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row || (studentId !== undefined && row.student_id !== studentId)) throw Errors.notFound();
    return row.status;
  }

  // ------------------------------------------------------------------------------------------
  // Photos (private; streamed only after an ownership or permission check)
  // ------------------------------------------------------------------------------------------

  async officialPhotoOf(studentId: string): Promise<PhotoFile> {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      select: { photoStorageKey: true },
    });
    return this.read(student?.photoStorageKey ?? null);
  }

  async ownRequestPhoto(studentId: string, id: string): Promise<PhotoFile> {
    const request = await this.prisma.client.studentProfileChangeRequest.findFirst({
      where: { id, studentId },
      select: { photoStorageKey: true },
    });
    return this.read(request?.photoStorageKey ?? null);
  }

  async requestPhoto(id: string, variant: ProfilePhotoVariant): Promise<PhotoFile> {
    const request = await this.prisma.client.studentProfileChangeRequest.findUnique({
      where: { id },
      select: { photoStorageKey: true, student: { select: { photoStorageKey: true } } },
    });
    if (!request) throw Errors.notFound();
    return this.read(
      variant === 'proposed' ? request.photoStorageKey : request.student.photoStorageKey,
    );
  }

  private async read(key: string | null): Promise<PhotoFile> {
    if (!key) throw Errors.notFound();
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.getObject(key, { maxBytes: MAX_PHOTO_READ_BYTES });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw Errors.notFound();
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.serviceUnavailable,
        'The photo is temporarily unavailable.',
      );
    }
    const contentType = imageContentType(bytes);
    if (!contentType) throw Errors.notFound();
    return { bytes, contentType };
  }
}

export interface PhotoFile {
  bytes: Uint8Array;
  contentType: string;
}
