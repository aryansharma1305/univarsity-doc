import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type Prisma, uniqueConstraintName } from '@docversity/database';
import { type ObjectStorage, ObjectNotFoundError, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS, type AuditAction } from '@docversity/types';
import {
  type ActivityItem,
  type DocumentDisposition,
  type DocumentVariant,
  documentReference,
  ERROR_CODES,
  type HistoricalDocumentDetail,
  type HistoricalDocumentList,
  type HistoricalDocumentQuery,
  type HistoricalDocumentRow,
  type HistoricalDocumentVersion,
  normalizeCertificateNumber,
  normalizeRegistrationNumber,
  type ReplaceHistoricalDocument,
  type ReviewAuthenticity,
  type StudentDocumentList,
  type UpdateHistoricalDocument,
  type UploadHistoricalDocument,
  type WithdrawHistoricalDocument,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { changedFields, invalidRelation } from '../common/conflicts.js';
import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import { inspectDocument, sniffContentType } from './document-file.js';
import type { UploadedDocument } from './document-upload.interceptor.js';
import {
  assertNoEmbeddedMetadata,
  createStudentCopy,
  type ImageContentType,
  type StudentCopy,
  StudentCopyError,
} from './student-copy.js';

const ENTITY = 'HistoricalDocument';
const ONE_FILE_INDEX = 'historical_documents_one_file_per_registration_key';
const ONE_REPLACEMENT_INDEX = 'historical_documents_one_live_replacement_key';
const MAX_READ_BYTES = 20 * 1024 * 1024;

const person = { select: { id: true, displayName: true } } as const;
const rowInclude = {
  registration: {
    select: {
      id: true,
      registrationNumber: true,
      studentId: true,
      student: { select: { id: true, fullName: true } },
      program: { select: { id: true, code: true, name: true } },
    },
  },
  uploadedBy: person,
} as const;
const detailInclude = {
  ...rowInclude,
  publishedBy: person,
  withdrawnBy: person,
  reviewedBy: person,
} as const;

/** Fields of one document in a replacement chain. */
const versionSelect = {
  id: true,
  title: true,
  certificateNumber: true,
  status: true,
  createdAt: true,
  publishedAt: true,
  replacesDocumentId: true,
} as const;
type VersionRecord = Prisma.HistoricalDocumentGetPayload<{ select: typeof versionSelect }>;

/** Replacement chains are short; this bounds the walk if data were ever inconsistent. */
const MAX_CHAIN = 100;

type RowRecord = Prisma.HistoricalDocumentGetPayload<{ include: typeof rowInclude }>;

export interface DocumentFile {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  disposition: DocumentDisposition;
}

const SUMMARIES: Partial<Record<AuditAction, string>> = {
  HISTORICAL_DOCUMENT_UPLOADED: 'Uploaded as a draft',
  HISTORICAL_DOCUMENT_UPDATED: 'Draft details updated',
  HISTORICAL_DOCUMENT_PUBLISHED: 'Published to the student',
  HISTORICAL_DOCUMENT_WITHDRAWN: 'Withdrawn from the student',
  HISTORICAL_DOCUMENT_REPLACED: 'Replaced by a newer document',
  HISTORICAL_DOCUMENT_AUTHENTICITY_REVIEWED: 'Authenticity reviewed',
  HISTORICAL_DOCUMENT_DOWNLOADED: 'Downloaded',
  HISTORICAL_DOCUMENT_STUDENT_COPY_CREATED: 'Student copy created (embedded metadata removed)',
};

const isImage = (contentType: string): contentType is ImageContentType =>
  contentType === 'image/jpeg' || contentType === 'image/png';

/** Display-only file name: no path, no control characters, bounded length. */
export function cleanFilename(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>]/g, '').trim();
  const limited = cleaned.length > 200 ? cleaned.slice(cleaned.length - 200) : cleaned;
  return limited === '' || limited === '.' || limited === '..' ? fallback : limited;
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function toRow(row: RowRecord): HistoricalDocumentRow {
  return {
    id: row.id,
    reference: documentReference(row.id),
    isReplacement: row.replacesDocumentId !== null,
    documentType: row.documentType,
    title: row.title,
    certificateNumber: row.certificateNumber,
    issuedOn: toDateOnly(row.issuedOn),
    status: row.status,
    authenticity: row.authenticity,
    student: row.registration.student,
    registration: {
      id: row.registration.id,
      registrationNumber: row.registration.registrationNumber,
      program: row.registration.program,
    },
    file: {
      contentType: row.contentType as HistoricalDocumentRow['file']['contentType'],
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      originalFilename: row.originalFilename,
    },
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

const notEditable = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.documentNotEditable, message);

const notReady = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.documentNotReady, message);

const unavailable = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_CODES.serviceUnavailable,
    'The document is temporarily unavailable.',
  );

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The certificate number exactly as given plus its searchable form (both, or neither). */
function certificateNumberFields(value: string | null | undefined) {
  if (value === undefined) return {};
  return value === null
    ? { certificateNumber: null, certificateNumberNormalized: null }
    : { certificateNumber: value, certificateNumberNormalized: normalizeCertificateNumber(value) };
}

/**
 * Phase 8: historical documents uploaded by staff for a registration and published to its student.
 * Every state change locks the row, re-checks the state, writes and audits in one transaction; the
 * database trigger enforces the same lifecycle. Files are private objects streamed only after a
 * permission (staff) or ownership + PUBLISHED (student) check; storage keys never leave the API.
 */
@Injectable()
export class HistoricalDocumentsService {
  private readonly logger = new Logger(HistoricalDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Staff: read
  // ------------------------------------------------------------------------------------------

  async list(query: HistoricalDocumentQuery): Promise<HistoricalDocumentList> {
    const where: Prisma.HistoricalDocumentWhereInput = {
      AND: [
        query.status ? { status: query.status } : {},
        query.documentType ? { documentType: query.documentType } : {},
        query.authenticity ? { authenticity: query.authenticity } : {},
        query.studentRegistrationId ? { studentRegistrationId: query.studentRegistrationId } : {},
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { certificateNumber: { contains: query.search, mode: 'insensitive' } },
                ...(normalizeCertificateNumber(query.search)
                  ? [
                      {
                        certificateNumberNormalized: {
                          contains: normalizeCertificateNumber(query.search),
                        },
                      },
                    ]
                  : []),
                {
                  registration: {
                    registrationNumberNormalized: {
                      contains: normalizeRegistrationNumber(query.search),
                    },
                  },
                },
                {
                  registration: {
                    student: { fullName: { contains: query.search, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {},
      ],
    };
    const orderBy: Prisma.HistoricalDocumentOrderByWithRelationInput[] =
      query.sortBy === 'issuedOn'
        ? [{ issuedOn: { sort: query.sortOrder, nulls: 'last' } }, { id: 'asc' }]
        : [{ createdAt: query.sortOrder }, { id: 'asc' }];
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.historicalDocument.findMany({
        where,
        include: rowInclude,
        orderBy,
        ...pageArgs(query),
      }),
      this.prisma.client.historicalDocument.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: paginationMeta(query, total) };
  }

  /**
   * The whole replacement chain of a document (oldest first) with revision numbers: the first
   * document of a chain is revision 1, its replacement revision 2, and so on. A withdrawn
   * replacement attempt keeps its revision number; references tell same-numbered attempts apart.
   */
  private async versions(
    docId: string,
    replacesId: string | null,
  ): Promise<(HistoricalDocumentVersion & { parentId: string | null })[]> {
    let rootId = docId;
    let parent = replacesId;
    for (let steps = 0; parent && steps < MAX_CHAIN; steps += 1) {
      rootId = parent;
      const up = await this.prisma.client.historicalDocument.findUnique({
        where: { id: parent },
        select: { replacesDocumentId: true },
      });
      parent = up?.replacesDocumentId ?? null;
    }
    const root = await this.prisma.client.historicalDocument.findUnique({
      where: { id: rootId },
      select: versionSelect,
    });
    if (!root) return [];
    const collected: { record: VersionRecord; revision: number }[] = [
      { record: root, revision: 1 },
    ];
    let frontier = [root.id];
    for (let revision = 2; frontier.length > 0 && revision <= MAX_CHAIN; revision += 1) {
      const children = await this.prisma.client.historicalDocument.findMany({
        where: { replacesDocumentId: { in: frontier } },
        select: versionSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      collected.push(...children.map((record) => ({ record, revision })));
      frontier = children.map((child) => child.id);
    }
    return collected.map(({ record, revision }) => ({
      id: record.id,
      reference: documentReference(record.id),
      revision,
      title: record.title,
      certificateNumber: record.certificateNumber,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      publishedAt: record.publishedAt?.toISOString() ?? null,
      parentId: record.replacesDocumentId,
    }));
  }

  async detail(id: string): Promise<HistoricalDocumentDetail> {
    const doc = await this.prisma.client.historicalDocument.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!doc) throw Errors.notFound();
    const [history, sameNumber, versions] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where: { entityType: ENTITY, entityId: id },
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { displayName: true } } },
        take: 100,
      }),
      doc.certificateNumberNormalized
        ? this.prisma.client.historicalDocument.findMany({
            where: {
              certificateNumberNormalized: doc.certificateNumberNormalized,
              id: { not: id },
              studentRegistrationId: { not: doc.studentRegistrationId },
            },
            select: {
              id: true,
              status: true,
              registration: { select: { registrationNumber: true } },
            },
            take: 10,
          })
        : Promise.resolve([]),
      this.versions(doc.id, doc.replacesDocumentId),
    ]);
    const chain = versions.map(({ parentId, ...version }) => ({ version, parentId }));
    const self = chain.find(({ version }) => version.id === doc.id)?.version;
    const replaces = chain.find(({ version }) => version.id === doc.replacesDocumentId)?.version;
    // The live (non-withdrawn) direct replacement; at most one exists (unique index).
    const replacedBy = chain.find(
      ({ version, parentId }) => parentId === doc.id && version.status !== 'WITHDRAWN',
    )?.version;
    const image = isImage(doc.contentType);
    return {
      ...toRow(doc),
      revision: self?.revision ?? 1,
      certificateNumberNormalized: doc.certificateNumberNormalized,
      studentCopy: !image
        ? { status: 'NOT_REQUIRED', sizeBytes: null, sha256: null, createdAt: null }
        : doc.studentCopyStorageKey
          ? {
              status: 'READY',
              sizeBytes: doc.studentCopySizeBytes,
              sha256: doc.studentCopySha256,
              createdAt: doc.studentCopyCreatedAt?.toISOString() ?? null,
            }
          : { status: 'PENDING', sizeBytes: null, sha256: null, createdAt: null },
      embeddedMetadata: {
        inspected: image && doc.studentCopyStorageKey !== null,
        categories: doc.embeddedMetadata,
      },
      provenance: doc.provenance,
      provenanceNote: doc.provenanceNote,
      legacySourceSystem: doc.legacySourceSystem,
      legacyRecordId: doc.legacyRecordId,
      legacyVerificationUrl: doc.legacyVerificationUrl,
      publishedBy: doc.publishedBy,
      withdrawnAt: doc.withdrawnAt?.toISOString() ?? null,
      withdrawnBy: doc.withdrawnBy,
      withdrawalReason: doc.withdrawalReason,
      supersededAt: doc.supersededAt?.toISOString() ?? null,
      authenticityNote: doc.authenticityNote,
      authenticityReviewedAt: doc.authenticityReviewedAt?.toISOString() ?? null,
      authenticityReviewedBy: doc.reviewedBy,
      replaces: replaces ?? null,
      replacedBy: replacedBy ?? null,
      versions: chain.map(({ version }) => version),
      sameNumberElsewhere: sameNumber.map((other) => ({
        id: other.id,
        registrationNumber: other.registration.registrationNumber,
        status: other.status,
      })),
      history: history.map((entry): ActivityItem => ({
        id: entry.id,
        action: entry.action,
        summary: SUMMARIES[entry.action as AuditAction] ?? entry.action,
        // Student downloads carry no staff actor; other actor-less entries are system steps.
        actor:
          entry.actor?.displayName ??
          (entry.actorUserId === null && entry.action === AUDIT_ACTIONS.historicalDocumentDownloaded
            ? 'Student'
            : null),
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  // ------------------------------------------------------------------------------------------
  // Staff: upload, replace, edit
  // ------------------------------------------------------------------------------------------

  /**
   * Validates the upload, prepares the student copy of an image (before anything is stored, so a
   * failure stores nothing), then stores the untouched original and the copy as separate private
   * objects. Returns the database fields for both.
   */
  private async storeFile(registrationId: string, file: UploadedDocument | undefined) {
    if (!file || file.size === 0) {
      throw Errors.validation([{ path: 'file', message: 'Choose a PDF, JPEG or PNG document.' }]);
    }
    const bytes = new Uint8Array(
      file.buffer.buffer,
      file.buffer.byteOffset,
      file.buffer.byteLength,
    );
    const inspected = await inspectDocument(bytes, file.mimetype);
    let copy: StudentCopy | null = null;
    if (isImage(inspected.contentType)) {
      try {
        copy = await createStudentCopy(bytes, inspected.contentType);
      } catch (error) {
        if (!(error instanceof StudentCopyError)) throw error;
        throw new AppError(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.unsupportedFile,
          'The scan could not be prepared for students. Upload a standard JPEG or PNG scan.',
          { details: [{ path: 'file', message: 'The scan could not be prepared for students.' }] },
        );
      }
    }
    const key = objectKeys.historicalDocument(registrationId, inspected.extension);
    const copyKey = copy
      ? objectKeys.historicalDocumentStudentCopy(registrationId, copy.extension)
      : null;
    const stored: string[] = [];
    try {
      await this.storage.putObject(key, bytes, { contentType: inspected.contentType });
      stored.push(key);
      if (copy && copyKey) {
        await this.storage.putObject(copyKey, copy.bytes, { contentType: copy.contentType });
        stored.push(copyKey);
      }
    } catch {
      await this.deleteObjects(stored);
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.serviceUnavailable,
        'Document storage is temporarily unavailable. Nothing was saved; please try again shortly.',
      );
    }
    return {
      keys: stored,
      fields: {
        storageKey: key,
        contentType: inspected.contentType,
        sizeBytes: bytes.byteLength,
        sha256: sha256Of(bytes),
        originalFilename: cleanFilename(file.originalname, `document.${inspected.extension}`),
        ...(copy && copyKey
          ? {
              studentCopyStorageKey: copyKey,
              studentCopyContentType: copy.contentType,
              studentCopySizeBytes: copy.sizeBytes,
              studentCopySha256: copy.sha256,
              studentCopyCreatedAt: new Date(),
              embeddedMetadata: copy.embeddedMetadata,
            }
          : {}),
      },
    };
  }

  private async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.storage.deleteObject(key).catch(() => undefined)));
  }

  /** Maps unique-index violations to clear conflicts and removes the just-stored objects. */
  private async recordOrCleanUp<T>(keys: string[], write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      await this.deleteObjects(keys);
      const index = uniqueConstraintName(error);
      if (index === ONE_FILE_INDEX) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.conflict,
          'This exact file is already on record for this registration.',
          { details: [{ path: 'file', message: 'Duplicate of an existing document.' }] },
        );
      }
      if (index === ONE_REPLACEMENT_INDEX) {
        throw notEditable('This document already has a replacement in progress.');
      }
      throw error;
    }
  }

  /** Audit metadata of a stored upload: IDs, sizes, hashes and metadata KINDS — never values. */
  private uploadAudit(
    fields: Awaited<ReturnType<HistoricalDocumentsService['storeFile']>>['fields'],
  ) {
    return {
      contentType: fields.contentType,
      sizeBytes: fields.sizeBytes,
      sha256: fields.sha256,
      ...(fields.studentCopySha256
        ? {
            studentCopySha256: fields.studentCopySha256,
            embeddedMetadata: fields.embeddedMetadata ?? [],
          }
        : {}),
    };
  }

  async upload(
    input: UploadHistoricalDocument,
    file: UploadedDocument | undefined,
    actorUserId: string,
  ): Promise<HistoricalDocumentDetail> {
    const registration = await this.prisma.client.studentRegistration.findUnique({
      where: { id: input.studentRegistrationId },
      select: { id: true, registrationNumber: true, studentId: true },
    });
    if (!registration) {
      throw invalidRelation('studentRegistrationId', 'Choose an existing registration.');
    }
    const stored = await this.storeFile(registration.id, file);
    const id = await this.recordOrCleanUp(stored.keys, () =>
      this.prisma.client.$transaction(async (tx) => {
        const doc = await tx.historicalDocument.create({
          data: {
            studentRegistrationId: registration.id,
            documentType: input.documentType,
            title: input.title,
            provenance: input.provenance,
            ...this.metadata(input),
            ...stored.fields,
            uploadedByUserId: actorUserId,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.historicalDocumentUploaded,
            entityType: ENTITY,
            entityId: doc.id,
            metadata: {
              registrationId: registration.id,
              registrationNumber: registration.registrationNumber,
              documentType: doc.documentType,
              ...this.uploadAudit(stored.fields),
            },
          },
          tx,
        );
        return doc.id;
      }),
    );
    return this.detail(id);
  }

  private metadata(input: Partial<UploadHistoricalDocument>) {
    return {
      ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...certificateNumberFields(input.certificateNumber),
      ...(input.issuedOn !== undefined ? { issuedOn: fromDateOnly(input.issuedOn) ?? null } : {}),
      ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
      ...(input.provenanceNote !== undefined
        ? { provenanceNote: input.provenanceNote ?? null }
        : {}),
      ...(input.legacySourceSystem !== undefined
        ? { legacySourceSystem: input.legacySourceSystem ?? null }
        : {}),
      ...(input.legacyRecordId !== undefined
        ? { legacyRecordId: input.legacyRecordId ?? null }
        : {}),
      ...(input.legacyVerificationUrl !== undefined
        ? { legacyVerificationUrl: input.legacyVerificationUrl }
        : {}),
    };
  }

  /**
   * A corrected document for a PUBLISHED or WITHDRAWN one: a new DRAFT linked to the original
   * (metadata copied unless corrected). The original is untouched until the replacement is published.
   */
  async replace(
    originalId: string,
    input: ReplaceHistoricalDocument,
    file: UploadedDocument | undefined,
    actorUserId: string,
  ): Promise<HistoricalDocumentDetail> {
    const original = await this.prisma.client.historicalDocument.findUnique({
      where: { id: originalId },
    });
    if (!original) throw Errors.notFound();
    if (original.status !== 'PUBLISHED' && original.status !== 'WITHDRAWN') {
      throw notEditable(
        original.status === 'DRAFT'
          ? 'Drafts are corrected by editing or withdrawing them, not replaced.'
          : 'This document has already been replaced.',
      );
    }
    const stored = await this.storeFile(original.studentRegistrationId, file);
    const id = await this.recordOrCleanUp(stored.keys, () =>
      this.prisma.client.$transaction(async (tx) => {
        const doc = await tx.historicalDocument.create({
          data: {
            studentRegistrationId: original.studentRegistrationId,
            documentType: original.documentType,
            title: original.title,
            certificateNumber: original.certificateNumber,
            certificateNumberNormalized: original.certificateNumberNormalized,
            issuedOn: original.issuedOn,
            provenance: original.provenance,
            provenanceNote: original.provenanceNote,
            legacySourceSystem: original.legacySourceSystem,
            legacyRecordId: original.legacyRecordId,
            legacyVerificationUrl: original.legacyVerificationUrl,
            ...this.metadata(input),
            ...stored.fields,
            uploadedByUserId: actorUserId,
            replacesDocumentId: original.id,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.historicalDocumentUploaded,
            entityType: ENTITY,
            entityId: doc.id,
            metadata: {
              registrationId: original.studentRegistrationId,
              replacesDocumentId: original.id,
              ...this.uploadAudit(stored.fields),
            },
          },
          tx,
        );
        return doc.id;
      }),
    );
    return this.detail(id);
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM historical_documents WHERE id = ${id}::uuid FOR UPDATE`;
    const doc = await tx.historicalDocument.findUnique({ where: { id } });
    if (!doc) throw Errors.notFound();
    return doc;
  }

  async update(
    id: string,
    input: UpdateHistoricalDocument,
    actorUserId: string,
  ): Promise<HistoricalDocumentDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== 'DRAFT') {
        throw notEditable(
          'Only drafts can be edited. To correct a published document, upload a replacement.',
        );
      }
      const after = await tx.historicalDocument.update({
        where: { id },
        data: this.metadata(input),
      });
      const changed = changedFields(before, after, [
        'documentType',
        'title',
        'certificateNumber',
        'issuedOn',
        'provenance',
        'provenanceNote',
        'legacySourceSystem',
        'legacyRecordId',
        'legacyVerificationUrl',
      ]);
      if (changed.length > 0) {
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.historicalDocumentUpdated,
            entityType: ENTITY,
            entityId: id,
            metadata: { changedFields: changed },
          },
          tx,
        );
      }
    });
    return this.detail(id);
  }

  // ------------------------------------------------------------------------------------------
  // Staff: lifecycle
  // ------------------------------------------------------------------------------------------

  /**
   * DRAFT or WITHDRAWN → PUBLISHED. Publishing a replacement supersedes its published original in
   * the same transaction, so the student never sees both (or neither).
   */
  async publish(id: string, actorUserId: string): Promise<HistoricalDocumentDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const doc = await this.lock(tx, id);
      if (doc.status !== 'DRAFT' && doc.status !== 'WITHDRAWN') {
        throw notEditable(`This document is already ${doc.status.toLowerCase()}.`);
      }
      if (isImage(doc.contentType) && !doc.studentCopyStorageKey) {
        throw notReady(
          'This scan does not have its student copy yet (embedded metadata removed), so it cannot be published. Run the student-copy backfill, then publish.',
        );
      }
      const liveReplacement = await tx.historicalDocument.findFirst({
        where: { replacesDocumentId: id, status: { not: 'WITHDRAWN' } },
        select: { id: true },
      });
      if (liveReplacement) {
        throw notEditable(
          'A replacement of this document exists; publish or withdraw that instead.',
        );
      }
      const original = doc.replacesDocumentId ? await this.lock(tx, doc.replacesDocumentId) : null;
      const now = new Date();
      await tx.historicalDocument.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: now, publishedByUserId: actorUserId },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.historicalDocumentPublished,
          entityType: ENTITY,
          entityId: id,
          metadata: {
            registrationId: doc.studentRegistrationId,
            from: doc.status,
            ...(original ? { replacesDocumentId: original.id } : {}),
          },
        },
        tx,
      );
      if (original?.status === 'PUBLISHED') {
        await tx.historicalDocument.update({
          where: { id: original.id },
          data: { status: 'SUPERSEDED', supersededAt: now },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.historicalDocumentReplaced,
            entityType: ENTITY,
            entityId: original.id,
            metadata: { replacedByDocumentId: id },
          },
          tx,
        );
      }
    });
    return this.detail(id);
  }

  async withdraw(
    id: string,
    input: WithdrawHistoricalDocument,
    actorUserId: string,
  ): Promise<HistoricalDocumentDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const doc = await this.lock(tx, id);
      if (doc.status !== 'DRAFT' && doc.status !== 'PUBLISHED') {
        throw notEditable(`A ${doc.status.toLowerCase()} document cannot be withdrawn.`);
      }
      await tx.historicalDocument.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          withdrawnByUserId: actorUserId,
          withdrawalReason: input.reason,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.historicalDocumentWithdrawn,
          entityType: ENTITY,
          entityId: id,
          // The reason stays on the document (staff-visible); it is not copied into the log.
          metadata: { registrationId: doc.studentRegistrationId, from: doc.status },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Official authenticity review. Independent of visibility; never by the uploader. */
  async reviewAuthenticity(
    id: string,
    input: ReviewAuthenticity,
    actorUserId: string,
  ): Promise<HistoricalDocumentDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const doc = await this.lock(tx, id);
      if (doc.status === 'SUPERSEDED')
        throw notEditable('A superseded document cannot be reviewed.');
      if (doc.uploadedByUserId === actorUserId) {
        throw new AppError(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.forbidden,
          'The person who uploaded a document cannot review its authenticity. Ask another authorised reviewer.',
        );
      }
      await tx.historicalDocument.update({
        where: { id },
        data: {
          authenticity: input.authenticity,
          authenticityNote: input.note,
          authenticityReviewedAt: new Date(),
          authenticityReviewedByUserId: actorUserId,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.historicalDocumentAuthenticityReviewed,
          entityType: ENTITY,
          entityId: id,
          metadata: { from: doc.authenticity, to: input.authenticity },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  // ------------------------------------------------------------------------------------------
  // Files
  // ------------------------------------------------------------------------------------------

  private async readObject(key: string): Promise<Uint8Array> {
    try {
      return await this.storage.getObject(key, { maxBytes: MAX_READ_BYTES });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw Errors.notFound();
      throw unavailable();
    }
  }

  private fileOf(
    id: string,
    bytes: Uint8Array,
    contentType: string,
    disposition: DocumentDisposition,
  ): DocumentFile {
    return {
      bytes,
      contentType,
      // The random tail of the UUIDv7 (same as the display reference); never the uploaded name.
      filename: `historical-document-${id.replace(/-/g, '').slice(-8)}.${EXTENSIONS[contentType] ?? 'bin'}`,
      disposition,
    };
  }

  /** The evidential original exactly as uploaded (staff only). */
  private async original(
    doc: { id: string; storageKey: string; contentType: string },
    disposition: DocumentDisposition,
  ): Promise<DocumentFile> {
    const bytes = await this.readObject(doc.storageKey);
    // Serve only what the stored bytes really are (defence in depth against a tampered object).
    if (sniffContentType(bytes) !== doc.contentType) throw Errors.notFound();
    return this.fileOf(doc.id, bytes, doc.contentType, disposition);
  }

  /**
   * What a student receives: for images ONLY the metadata-free student copy, checked against its
   * recorded checksum and the structural allow-list on every read; for PDFs the original, checked
   * against its checksum. There is no fallback: a missing copy is "not ready" (409), a missing or
   * altered object is an error — the original image is never served in its place.
   */
  private async studentDelivery(
    doc: {
      id: string;
      storageKey: string;
      contentType: string;
      sha256: string;
      studentCopyStorageKey: string | null;
      studentCopyContentType: string | null;
      studentCopySha256: string | null;
    },
    disposition: DocumentDisposition,
  ): Promise<DocumentFile> {
    if (!isImage(doc.contentType)) {
      const bytes = await this.readObject(doc.storageKey);
      if (sha256Of(bytes) !== doc.sha256 || sniffContentType(bytes) !== doc.contentType) {
        this.logger.error(`Integrity check failed for historical document ${doc.id} (original)`);
        throw unavailable();
      }
      return this.fileOf(doc.id, bytes, doc.contentType, disposition);
    }
    if (!doc.studentCopyStorageKey || !doc.studentCopySha256 || !doc.studentCopyContentType) {
      throw notReady('This document is still being prepared for viewing. Please try again later.');
    }
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.getObject(doc.studentCopyStorageKey, { maxBytes: MAX_READ_BYTES });
    } catch {
      this.logger.error(`Student copy of historical document ${doc.id} could not be read`);
      throw unavailable();
    }
    try {
      if (sha256Of(bytes) !== doc.studentCopySha256)
        throw new StudentCopyError('checksum mismatch');
      if (sniffContentType(bytes) !== doc.studentCopyContentType) {
        throw new StudentCopyError('unexpected content type');
      }
      assertNoEmbeddedMetadata(bytes, doc.studentCopyContentType as ImageContentType);
    } catch (error) {
      this.logger.error(
        `Student copy of historical document ${doc.id} failed its check: ${(error as Error).message}`,
      );
      throw unavailable();
    }
    return this.fileOf(doc.id, bytes, doc.studentCopyContentType, disposition);
  }

  async staffFile(
    id: string,
    disposition: DocumentDisposition,
    variant: DocumentVariant,
    actorUserId: string,
  ): Promise<DocumentFile> {
    const doc = await this.prisma.client.historicalDocument.findUnique({ where: { id } });
    if (!doc) throw Errors.notFound();
    const file =
      variant === 'original'
        ? await this.original(doc, disposition)
        : await this.studentDelivery(doc, disposition);
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.historicalDocumentDownloaded,
      entityType: ENTITY,
      entityId: id,
      metadata: { principal: 'staff', disposition, variant },
    });
    return file;
  }

  // ------------------------------------------------------------------------------------------
  // Student (own, PUBLISHED only)
  // ------------------------------------------------------------------------------------------

  async listOwn(studentId: string): Promise<StudentDocumentList> {
    const docs = await this.prisma.client.historicalDocument.findMany({
      where: { status: 'PUBLISHED', registration: { studentId } },
      include: {
        registration: {
          select: {
            registrationNumber: true,
            program: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [{ issuedOn: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }],
    });
    return {
      data: docs.map((doc) => {
        const image = isImage(doc.contentType);
        return {
          id: doc.id,
          reference: documentReference(doc.id),
          documentType: doc.documentType,
          title: doc.title,
          certificateNumber: doc.certificateNumber,
          issuedOn: toDateOnly(doc.issuedOn),
          registrationNumber: doc.registration.registrationNumber,
          program: doc.registration.program,
          contentType: doc.contentType as 'application/pdf',
          // The size of the file the student receives (the copy, for images).
          sizeBytes: image ? (doc.studentCopySizeBytes ?? doc.sizeBytes) : doc.sizeBytes,
          publishedAt: (doc.publishedAt ?? doc.createdAt).toISOString(),
          authenticity: doc.authenticity,
          authenticityReviewedAt: doc.authenticityReviewedAt?.toISOString() ?? null,
          available: !image || doc.studentCopyStorageKey !== null,
        };
      }),
    };
  }

  async ownFile(
    studentId: string,
    accountId: string,
    id: string,
    disposition: DocumentDisposition,
  ): Promise<DocumentFile> {
    // Ownership AND publication in one query: anything else is simply "not found".
    const doc = await this.prisma.client.historicalDocument.findFirst({
      where: { id, status: 'PUBLISHED', registration: { studentId } },
    });
    if (!doc) throw Errors.notFound();
    const file = await this.studentDelivery(doc, disposition);
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.historicalDocumentDownloaded,
      entityType: ENTITY,
      entityId: id,
      metadata: { principal: 'student', studentId, accountId, disposition, variant: 'student' },
    });
    return file;
  }
}
