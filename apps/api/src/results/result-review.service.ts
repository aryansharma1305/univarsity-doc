import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  DRAFT_MARK_FIELDS,
  ERROR_CODES,
  type ReviewAction,
  type ReviewQuery,
  type ReviewedResult,
} from '@docversity/validation';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ResultImportsService } from '../result-imports/result-imports.service.js';
import { DraftResultsService } from './draft-results.service.js';
const include = {
  examination: { include: { curriculum: true } },
  studentRegistration: { include: { student: true } },
  items: { include: { programSubject: { include: { subject: true } } } },
  reviewEvents: {
    include: { actor: { select: { displayName: true } } },
    orderBy: { resultVersion: 'asc' as const },
  },
} as const;
type Record = Prisma.ResultGetPayload<{ include: typeof include }>;
type Action = 'SUBMIT' | 'RETURN' | 'REJECT' | 'APPROVE';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
export const RESULT_REVIEW_POLICY = {
  approvalEnabled: false,
  makerCheckerRequired: true,
  approvalBlockers: ['University review/approval role policy has not been authorized.'],
  publicationEnabled: false as const,
  publicationBlockers: [
    'Publication configuration required: authorized publishing roles and scope.',
    'Official grading, pass/fail, completeness and re-exam result selection rules are unresolved.',
    'Release dates, correction and withdrawal policies are unresolved.',
  ],
};
@Injectable()
export class ResultReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: DraftResultsService,
    private readonly audit: AuditService,
    private readonly imports: ResultImportsService,
  ) {}
  policy() {
    return RESULT_REVIEW_POLICY;
  }
  contexts() {
    return this.imports.contextOptions();
  }
  async snapshot(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      { snapshot: Prisma.JsonValue }[]
    >`SELECT docversity_result_review_snapshot(${id}::uuid) AS snapshot`;
    if (!rows[0]?.snapshot) throw Errors.notFound();
    return rows[0].snapshot;
  }
  private async present(r: Record, tx: Prisma.TransactionClient): Promise<ReviewedResult> {
    const sourceLogs = await tx.auditLog.findMany({
      where: {
        entityType: 'ResultItem',
        entityId: { in: r.items.map((i) => i.id) },
        action: { in: [AUDIT_ACTIONS.resultDraftCreated, AUDIT_ACTIONS.resultDraftUpdated] },
      },
      orderBy: { createdAt: 'asc' },
    });
    const subjects = r.items.map((i) => {
      const logs = sourceLogs.filter((log) => log.entityId === i.id);
      const source = logs[0]?.metadata as { batchId?: string } | null;
      const draft = this.drafts.present({ ...i, result: r });
      return {
        id: i.id,
        programSubjectId: i.programSubjectId,
        subjectCode: i.programSubject.subject.code,
        subjectName: i.programSubject.subject.name,
        marks: draft.marks,
        reExamApplicationId: i.reExamApplicationId,
        origin: logs.length
          ? source?.batchId
            ? ('EXCEL' as const)
            : ('MANUAL' as const)
          : ('LEGACY' as const),
        batchId: source?.batchId ?? null,
        issues: draft.issues,
      };
    });
    const issues = subjects.flatMap((s) =>
      s.issues.map((i) => ({ ...i, message: `${s.subjectCode}: ${i.message}` })),
    );
    if (!subjects.length)
      issues.push({
        field: null,
        code: 'NO_SUBJECTS',
        message: 'Add the assigned subject marks before submitting.',
      });
    if (
      !r.examination.curriculumId ||
      r.studentRegistration.status !== 'ACTIVE' ||
      r.studentRegistration.curriculumId !== r.examination.curriculumId ||
      r.studentRegistration.programId !== r.examination.programId
    )
      issues.push({
        field: null,
        code: 'INELIGIBLE_REGISTRATION',
        message: 'Registration is not active in this examination curriculum.',
      });
    if (!['OPEN', 'UNDER_REVIEW'].includes(r.examination.status))
      issues.push({
        field: null,
        code: 'EXAMINATION_LOCKED',
        message: 'Examination is not open for internal review.',
      });
    const expected = !r.examination.curriculumId
      ? []
      : r.examination.kind === 'REGULAR'
        ? (
            await tx.programSubject.findMany({
              where: {
                curriculumId: r.examination.curriculumId,
                semesterNumber: r.examination.semesterNumber,
              },
              select: { id: true },
            })
          ).map((s) => s.id)
        : (
            await tx.reExamApplication.findMany({
              where: {
                examinationId: r.examinationId,
                studentRegistrationId: r.studentRegistrationId,
                attemptNumber: r.attemptNumber,
                status: 'APPROVED',
              },
              select: { programSubjectId: true },
            })
          ).map((a) => a.programSubjectId);
    if (!expected.length || expected.some((id) => !r.items.some((i) => i.programSubjectId === id)))
      issues.push({
        field: null,
        code: 'INCOMPLETE_SUBJECTS',
        message: 'All eligible subjects for this examination attempt need marks before submission.',
      });
    for (const i of r.items) {
      if (
        !expected.includes(i.programSubjectId) ||
        i.programSubject.curriculumId !== r.examination.curriculumId ||
        i.programSubject.semesterNumber !== r.examination.semesterNumber
      )
        issues.push({
          field: null,
          code: 'INCORRECT_SUBJECT',
          message: 'A subject is outside this examination attempt.',
        });
      if (r.examination.kind === 'REGULAR' && (r.attemptNumber !== 1 || i.reExamApplicationId))
        issues.push({
          field: null,
          code: 'INCORRECT_ATTEMPT',
          message: 'Regular examination marks require attempt 1 and no re-exam application.',
        });
      if (r.examination.kind === 'RE_EXAMINATION') {
        const a = i.reExamApplicationId
          ? await tx.reExamApplication.findUnique({ where: { id: i.reExamApplicationId } })
          : null;
        if (
          a?.status !== 'APPROVED' ||
          a.examinationId !== r.examinationId ||
          a.studentRegistrationId !== r.studentRegistrationId ||
          a.programSubjectId !== i.programSubjectId ||
          a.attemptNumber !== r.attemptNumber
        )
          issues.push({
            field: null,
            code: 'INCORRECT_APPLICATION',
            message: 'Approved re-exam application must match this subject and exact attempt.',
          });
      }
    }
    return {
      id: r.id,
      version: r.version,
      status: r.publicationStatus,
      registrationId: r.studentRegistrationId,
      registrationNumber: r.studentRegistration.registrationNumber,
      studentName: r.studentRegistration.student.fullName,
      examinationId: r.examinationId,
      examinationName: r.examination.name,
      programId: r.examination.programId,
      curriculumId: r.examination.curriculumId,
      academicSessionId: r.examination.academicSessionId,
      periodNumber: r.examination.semesterNumber,
      structure: r.examination.curriculum?.structureType ?? 'UNCONFIGURED',
      attemptNumber: r.attemptNumber,
      revisionNumber: r.revisionNumber,
      subjects,
      issues,
      policy: this.policy(),
      history: r.reviewEvents.map((e) => ({
        id: e.id,
        actorUserId: e.actorUserId,
        actorName: e.actor.displayName,
        action: e.action,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        version: e.resultVersion,
        createdAt: e.createdAt.toISOString(),
        reason: e.reason,
        snapshotDigest: hash(e.snapshot),
      })),
    };
  }
  async version(id: string, eventId: string) {
    const event = await this.prisma.client.resultReviewEvent.findUnique({
      where: { id: eventId },
      include: {
        result: {
          include: { items: { include: { programSubject: { include: { subject: true } } } } },
        },
      },
    });
    if (event?.resultId !== id) throw Errors.notFound();
    const snapshot = event.snapshot as {
      items: { id: string; program_subject_id: string; [key: string]: unknown }[];
    };
    return {
      id: event.id,
      resultId: id,
      version: event.resultVersion,
      snapshotDigest: hash(event.snapshot),
      subjects: snapshot.items.map((i) => {
        const subject = event.result.items.find(
          (current) => current.programSubjectId === i.program_subject_id,
        )?.programSubject.subject;
        return {
          id: i.id,
          programSubjectId: i.program_subject_id,
          subjectCode: subject?.code ?? 'Historical subject',
          subjectName: subject?.name ?? 'Historical subject',
          marks: Object.fromEntries(
            DRAFT_MARK_FIELDS.map((field) => [
              field,
              i[field.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())] === null
                ? null
                : String(i[field.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())]),
            ]),
          ),
        };
      }),
    };
  }
  async get(id: string) {
    return this.prisma.client.$transaction(
      async (tx) => {
        const r = await tx.result.findUnique({ where: { id }, include });
        if (!r) throw Errors.notFound();
        return this.present(r, tx);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async list(q: ReviewQuery) {
    const where: Prisma.ResultWhereInput = {
      ...(q.status ? { publicationStatus: q.status } : {}),
      ...(q.examinationId ? { examinationId: q.examinationId } : {}),
      examination: {
        ...(q.programId ? { programId: q.programId } : {}),
        ...(q.curriculumId ? { curriculumId: q.curriculumId } : {}),
        ...(q.academicSessionId ? { academicSessionId: q.academicSessionId } : {}),
        ...(q.periodNumber ? { semesterNumber: q.periodNumber } : {}),
      },
      ...(q.programSubjectId ? { items: { some: { programSubjectId: q.programSubjectId } } } : {}),
    };
    return this.prisma.client.$transaction(
      async (tx) => {
        const total = await tx.result.count({ where });
        const rows = await tx.result.findMany({
          where,
          include,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        const items: ReviewedResult[] = [];
        for (const row of rows) items.push(await this.present(row, tx));
        return {
          items,
          meta: {
            page: q.page,
            pageSize: q.pageSize,
            total,
            totalPages: Math.ceil(total / q.pageSize),
          },
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 60000 },
    );
  }
  async transition(id: string, action: Action, body: ReviewAction, actor: string) {
    if (action !== 'SUBMIT' && !this.policy().approvalEnabled)
      throw conflict(this.policy().approvalBlockers.join(' '));
    const requestDigest = hash({ id, action, body, actor });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.client.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM results WHERE id=${id}::uuid FOR UPDATE`;
            const replay = await tx.resultReviewEvent.findUnique({ where: { id: body.requestId } });
            if (replay) {
              if (replay.actorUserId !== actor || replay.requestDigest !== requestDigest)
                throw conflict('Request identifier already belongs to another action.');
              return {
                requestId: replay.id,
                resultId: replay.resultId,
                version: replay.resultVersion,
                status: replay.toStatus,
              };
            }
            const r = await tx.result.findUnique({ where: { id }, include });
            if (!r) throw Errors.notFound();
            if (r.version !== body.expectedVersion || r.publishedAt)
              throw conflict('Result changed or is locked. Reload before acting.');
            const expected =
              action === 'SUBMIT' ? 'DRAFT' : action === 'APPROVE' ? 'UNDER_REVIEW' : null;
            if (
              expected
                ? r.publicationStatus !== expected
                : !['UNDER_REVIEW', 'APPROVED'].includes(r.publicationStatus)
            )
              throw conflict('This action is not available in the current result state.');
            if ((action === 'RETURN' || action === 'REJECT') && !body.reason)
              throw Errors.validation([
                { path: 'reason', message: 'Provide a correction or rejection reason.' },
              ]);
            const snapshot = await this.snapshot(tx, id);
            if (action === 'SUBMIT' || action === 'APPROVE') {
              const current = await this.present(r, tx);
              if (current.issues.length)
                throw Errors.validation(
                  current.issues.map((i) => ({ path: i.field ?? 'result', message: i.message })),
                );
            }
            if (action !== 'SUBMIT') {
              const authors = await tx.auditLog.findMany({
                where: {
                  entityType: 'ResultItem',
                  entityId: { in: r.items.map((i) => i.id) },
                  action: {
                    in: [AUDIT_ACTIONS.resultDraftCreated, AUDIT_ACTIONS.resultDraftUpdated],
                  },
                },
                select: { actorUserId: true, entityId: true },
              });
              if (
                r.items.some(
                  (item) => !authors.some((a) => a.entityId === item.id && a.actorUserId),
                )
              )
                throw conflict('Marks provenance is missing; approval requires an audited draft.');
              if (
                authors.some((a) => a.actorUserId === actor) ||
                r.reviewEvents.some((e) => e.action === 'SUBMIT' && e.actorUserId === actor)
              )
                throw Errors.forbidden();
              const submitted = [...r.reviewEvents].reverse().find((e) => e.action === 'SUBMIT');
              if (!submitted || hash(submitted.snapshot) !== hash(snapshot))
                throw conflict('Marks differ from the submitted version. Return for correction.');
            }
            const status =
              action === 'SUBMIT' ? 'UNDER_REVIEW' : action === 'APPROVE' ? 'APPROVED' : 'DRAFT';
            const version = r.version + 1;
            await tx.resultReviewEvent.create({
              data: {
                id: body.requestId,
                resultId: id,
                actorUserId: actor,
                action,
                fromStatus: r.publicationStatus,
                toStatus: status,
                resultVersion: version,
                requestDigest,
                snapshot: snapshot,
                reason: body.reason ?? null,
              },
            });
            const changed = await tx.result.updateMany({
              where: { id, version: body.expectedVersion, publicationStatus: r.publicationStatus },
              data: {
                publicationStatus: status,
                version,
                approvedAt: action === 'APPROVE' ? new Date() : null,
              },
            });
            if (changed.count !== 1) throw conflict('Another staff member changed this result.');
            const auditAction = {
              SUBMIT: AUDIT_ACTIONS.resultReviewSubmitted,
              RETURN: AUDIT_ACTIONS.resultReviewReturned,
              REJECT: AUDIT_ACTIONS.resultReviewRejected,
              APPROVE: AUDIT_ACTIONS.resultReviewApproved,
            }[action];
            await this.audit.writeAuditEvent(
              {
                actorUserId: actor,
                action: auditAction,
                entityType: 'Result',
                entityId: id,
                metadata: {
                  requestId: body.requestId,
                  registrationId: r.studentRegistrationId,
                  examinationId: r.examinationId,
                  attemptNumber: r.attemptNumber,
                  subjectIds: r.items.map((i) => i.programSubjectId),
                  previousState: r.publicationStatus,
                  newState: status,
                  previousVersion: r.version,
                  newVersion: version,
                  snapshotDigest: hash(snapshot),
                  reason: body.reason ?? null,
                },
              },
              tx,
            );
            return { requestId: body.requestId, resultId: id, version, status };
          },
          { isolationLevel: 'Serializable', timeout: 60000 },
        );
      } catch (error) {
        const failure = error as {
          code?: string;
          meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } };
        };
        const code = failure.code;
        const serialization =
          code === 'P2034' ||
          (code === 'P2010' &&
            ['40001', '40P01'].includes(
              failure.meta?.code ?? failure.meta?.driverAdapterError?.cause?.originalCode ?? '',
            ));
        if (serialization && attempt < 2) continue;
        if (serialization || code === 'P2002')
          throw conflict('Concurrent result action. Reload and retry.');
        throw error;
      }
    }
    throw conflict('Reload and retry.');
  }
  publish(): never {
    throw conflict(this.policy().publicationBlockers.join(' '));
  }
}
