import { HttpStatus, Injectable } from '@nestjs/common';
import { type Prisma, uniqueConstraintName } from '@docversity/database';
import { AUDIT_ACTIONS, type AuditAction } from '@docversity/types';
import {
  type ActivityItem,
  type ApproveReExamApplication,
  type CreateReExamApplication,
  ERROR_CODES,
  type FeeSnapshot,
  formatMoney,
  periodLabel,
  RE_EXAM_ATTEMPT_BASIS,
  type ReExamApplicationDetail,
  type ReExamApplicationExportQuery,
  type ReExamApplicationList,
  type ReExamApplicationQuery,
  type ReExamApplicationRow,
  type ReExamFeeBlockedReason,
  reExamReference,
  type RejectReExamApplication,
  type StudentReExamApplication,
  type StudentReExamApplicationList,
  type StudentReExamOptions,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { invalidRelation } from '../common/conflicts.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { type FeeAssessment, FeeRulesService } from './fee-rules.service.js';

const ENTITY = 'ReExamApplication';
const ONE_LIVE_INDEX = 're_exam_applications_one_live_key';
const EXPORT_LIMIT = 5000;

const STAFF_SUMMARIES: Partial<Record<AuditAction, string>> = {
  RE_EXAM_APPLICATION_SUBMITTED: 'Submitted by the student',
  RE_EXAM_APPLICATION_FEE_ASSESSED: 'Fee assessed',
  RE_EXAM_APPLICATION_CANCELLED: 'Cancelled by the student',
  RE_EXAM_APPLICATION_APPROVED: 'Approved',
  RE_EXAM_APPLICATION_REJECTED: 'Rejected',
};

/** Student-facing wording (no staff names). */
const STUDENT_SUMMARIES: Partial<Record<AuditAction, string>> = {
  RE_EXAM_APPLICATION_SUBMITTED: 'You submitted the application',
  RE_EXAM_APPLICATION_FEE_ASSESSED: 'Fee assessed',
  RE_EXAM_APPLICATION_CANCELLED: 'You cancelled the application',
  RE_EXAM_APPLICATION_APPROVED: 'Approved by the university',
  RE_EXAM_APPLICATION_REJECTED: 'Rejected by the university',
};

type AppRecord = Prisma.ReExamApplicationGetPayload<{
  include: { decidedBy: { select: { id: true; displayName: true } } };
}>;

function feeOf(app: AppRecord): FeeSnapshot {
  return {
    status: app.feeStatus,
    blockedReason: (app.feeBlockedReason as ReExamFeeBlockedReason | null) ?? null,
    amountMinor: app.feeAmountMinor,
    currency: app.feeCurrency,
    scope: app.feeScope,
    ruleVersion: app.feeRuleVersion,
    assessedAt: app.feeAssessedAt?.toISOString() ?? null,
  };
}

function toRow(app: AppRecord): ReExamApplicationRow {
  return {
    id: app.id,
    reference: reExamReference(app.id),
    status: app.status,
    submittedAt: app.submittedAt.toISOString(),
    decidedAt: app.decidedAt?.toISOString() ?? null,
    student: { id: app.studentId, name: app.studentName },
    registrationId: app.studentRegistrationId,
    registrationNumber: app.registrationNumber,
    program: { code: app.programCode, name: app.programName },
    academicSessionName: app.academicSessionName,
    periodLabel: app.periodLabel,
    examination: { id: app.examinationId, name: app.examinationName, examSession: app.examSession },
    subject: { code: app.subjectCode, name: app.subjectName },
    attemptNumber: app.attemptNumber,
    fee: feeOf(app),
  };
}

function feeData(fee: FeeAssessment, now: Date) {
  return fee.status === 'ASSESSED'
    ? {
        feeStatus: 'ASSESSED' as const,
        feeBlockedReason: null,
        feeRuleId: fee.ruleId,
        feeRuleVersion: fee.ruleVersion,
        feeScope: fee.scope,
        feeCurrency: fee.currency,
        feeAmountMinor: fee.amountMinor,
        feeAssessedAt: now,
      }
    : { feeStatus: 'NOT_CONFIGURED' as const, feeBlockedReason: fee.blockedReason };
}

/** Spreadsheet-safe CSV cell (formula injection neutralised, quotes doubled). */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
const unavailable = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);

/** Registration statuses that may apply online (others contact the examination office). */
const CAN_APPLY = new Set(['ACTIVE', 'COMPLETED']);

/**
 * Phase 9B: re-exam applications. Identity comes from the student's own registration; attempt
 * number and fee are derived by the server under a per-(registration, subject) lock and snapshotted.
 * Decisions are separate from payment (Phase 9C) and recorded with reasons; nothing is deleted.
 */
@Injectable()
export class ReExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fees: FeeRulesService,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Attempts
  // ------------------------------------------------------------------------------------------

  /** Attempt n = 1 + earlier non-rejected, non-cancelled applications (registration + subject). */
  private async nextAttempt(
    db: Prisma.TransactionClient,
    registrationId: string,
    subjectId: string,
  ): Promise<number> {
    const earlier = await db.reExamApplication.count({
      where: {
        studentRegistrationId: registrationId,
        subjectId,
        status: { in: ['SUBMITTED', 'APPROVED'] },
      },
    });
    return earlier + 1;
  }

  // ------------------------------------------------------------------------------------------
  // Student
  // ------------------------------------------------------------------------------------------

  async options(studentId: string): Promise<StudentReExamOptions> {
    const registrations = await this.prisma.client.studentRegistration.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { fullName: true } },
        program: { select: { code: true, name: true } },
        academicSession: { select: { name: true } },
        curriculum: {
          select: {
            structureType: true,
            examinations: {
              where: { kind: 'RE_EXAMINATION', status: 'OPEN', reExamApplicationsOpen: true },
              orderBy: [{ semesterNumber: 'asc' }, { createdAt: 'asc' }],
            },
            subjects: {
              include: { subject: { select: { id: true, code: true, name: true } } },
              orderBy: [{ semesterNumber: 'asc' }, { displayOrder: 'asc' }],
            },
          },
        },
      },
    });
    const db = this.prisma.client;
    const result: StudentReExamOptions = { registrations: [] };
    for (const registration of registrations) {
      const curriculum = registration.curriculum;
      const unavailableReason = !CAN_APPLY.has(registration.status)
        ? 'This registration is not active. Contact the examination office.'
        : curriculum === null
          ? 'No syllabus has been assigned to this registration yet. Contact the registrar’s office.'
          : null;
      const examinations: StudentReExamOptions['registrations'][number]['examinations'] = [];
      if (!unavailableReason && curriculum) {
        const live = await db.reExamApplication.findMany({
          where: {
            studentRegistrationId: registration.id,
            status: { in: ['SUBMITTED', 'APPROVED'] },
          },
          select: { examinationId: true, subjectId: true },
        });
        for (const exam of curriculum.examinations) {
          const subjects = [];
          for (const line of curriculum.subjects.filter(
            (candidate) => candidate.semesterNumber === exam.semesterNumber,
          )) {
            const attemptNumber = await this.nextAttempt(db, registration.id, line.subject.id);
            const fee = await this.fees.assess(db, attemptNumber);
            subjects.push({
              programSubjectId: line.id,
              code: line.subject.code,
              name: line.subject.name,
              alreadyApplied: live.some(
                (a) => a.examinationId === exam.id && a.subjectId === line.subject.id,
              ),
              attemptNumber,
              fee:
                fee.status === 'ASSESSED'
                  ? {
                      status: 'ASSESSED' as const,
                      blockedReason: null,
                      amountMinor: fee.amountMinor,
                      currency: fee.currency,
                      scope: fee.scope,
                    }
                  : {
                      status: 'NOT_CONFIGURED' as const,
                      blockedReason: fee.blockedReason,
                      amountMinor: null,
                      currency: null,
                      scope: null,
                    },
            });
          }
          examinations.push({
            id: exam.id,
            name: exam.name,
            examSession: exam.examSession,
            period: {
              number: exam.semesterNumber,
              label: periodLabel(curriculum.structureType, exam.semesterNumber),
            },
            subjects,
          });
        }
      }
      result.registrations.push({
        registrationId: registration.id,
        studentName: registration.student.fullName,
        registrationNumber: registration.registrationNumber,
        program: registration.program,
        academicSessionName: registration.academicSession.name,
        structureType: curriculum?.structureType ?? null,
        unavailableReason,
        examinations,
      });
    }
    return result;
  }

  async submit(
    studentId: string,
    accountId: string,
    input: CreateReExamApplication,
  ): Promise<StudentReExamApplication> {
    let id: string;
    try {
      id = await this.prisma.client.$transaction(async (tx) => {
        const registration = await tx.studentRegistration.findFirst({
          // Ownership: only the signed-in student's own registrations exist here.
          where: { id: input.registrationId, studentId },
          include: {
            student: { select: { fullName: true } },
            program: { select: { code: true, name: true } },
            academicSession: { select: { name: true } },
            curriculum: { select: { id: true, structureType: true } },
          },
        });
        if (!registration) throw Errors.notFound();
        if (!CAN_APPLY.has(registration.status)) {
          throw unavailable('This registration is not active. Contact the examination office.');
        }
        const exam = await tx.examination.findUnique({ where: { id: input.examinationId } });
        const curriculum = registration.curriculum;
        if (curriculum === null) {
          throw unavailable(
            'No syllabus has been assigned to this registration yet. Contact the registrar’s office.',
          );
        }
        if (
          exam?.kind !== 'RE_EXAMINATION' ||
          exam.status !== 'OPEN' ||
          !exam.reExamApplicationsOpen ||
          exam.curriculumId !== curriculum.id
        ) {
          throw invalidRelation(
            'examinationId',
            'This re-examination is not open for applications from your registration.',
          );
        }
        const line = await tx.programSubject.findFirst({
          where: {
            id: input.programSubjectId,
            curriculumId: curriculum.id,
            semesterNumber: exam.semesterNumber,
          },
          include: { subject: { select: { id: true, code: true, name: true } } },
        });
        if (!line) {
          throw invalidRelation('programSubjectId', 'Choose a subject of this semester or year.');
        }
        // One attempt count per registration + subject at a time.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${registration.id}:${line.subject.id}`}, 0))`;
        const attemptNumber = await this.nextAttempt(tx, registration.id, line.subject.id);
        const fee = await this.fees.assess(tx, attemptNumber);
        const now = new Date();
        const app = await tx.reExamApplication.create({
          data: {
            studentId,
            studentRegistrationId: registration.id,
            examinationId: exam.id,
            programSubjectId: line.id,
            subjectId: line.subject.id,
            attemptNumber,
            attemptBasis: RE_EXAM_ATTEMPT_BASIS,
            studentName: registration.student.fullName,
            registrationNumber: registration.registrationNumber,
            programCode: registration.program.code,
            programName: registration.program.name,
            academicSessionName: registration.academicSession.name,
            periodLabel: periodLabel(curriculum.structureType, exam.semesterNumber),
            subjectCode: line.subject.code,
            subjectName: line.subject.name,
            examinationName: exam.name,
            examSession: exam.examSession,
            submittedByAccountId: accountId,
            ...feeData(fee, now),
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId: null,
            action: AUDIT_ACTIONS.reExamApplicationSubmitted,
            entityType: ENTITY,
            entityId: app.id,
            metadata: {
              principal: 'student',
              studentId,
              accountId,
              registrationId: registration.id,
              examinationId: exam.id,
              subjectId: line.subject.id,
              attemptNumber,
              feeStatus: app.feeStatus,
              ...(app.feeStatus === 'ASSESSED'
                ? {
                    feeRuleVersion: app.feeRuleVersion,
                    feeAmountMinor: app.feeAmountMinor,
                    feeCurrency: app.feeCurrency,
                  }
                : { feeBlockedReason: app.feeBlockedReason }),
            },
          },
          tx,
        );
        return app.id;
      });
    } catch (error) {
      if (uniqueConstraintName(error) === ONE_LIVE_INDEX) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.conflict,
          'You already have an application for this subject in this re-examination.',
          { details: [{ path: 'programSubjectId', message: 'Already applied.' }] },
        );
      }
      throw error;
    }
    return this.ownDetail(studentId, id);
  }

  private async ownRecord(studentId: string, id: string) {
    const app = await this.prisma.client.reExamApplication.findFirst({
      where: { id, studentId },
      include: { decidedBy: { select: { id: true, displayName: true } } },
    });
    if (!app) throw Errors.notFound();
    return app;
  }

  private async toStudent(app: AppRecord): Promise<StudentReExamApplication> {
    const history = await this.prisma.client.auditLog.findMany({
      where: { entityType: ENTITY, entityId: app.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return {
      id: app.id,
      reference: reExamReference(app.id),
      status: app.status,
      submittedAt: app.submittedAt.toISOString(),
      registrationNumber: app.registrationNumber,
      programName: app.programName,
      academicSessionName: app.academicSessionName,
      periodLabel: app.periodLabel,
      examinationName: app.examinationName,
      examSession: app.examSession,
      subject: { code: app.subjectCode, name: app.subjectName },
      attemptNumber: app.attemptNumber,
      fee: feeOf(app),
      decidedAt: app.decidedAt?.toISOString() ?? null,
      decisionReason: app.decisionReason,
      cancelledAt: app.cancelledAt?.toISOString() ?? null,
      history: history
        .filter((entry) => STUDENT_SUMMARIES[entry.action as AuditAction])
        .map((entry) => ({
          summary: STUDENT_SUMMARIES[entry.action as AuditAction] ?? entry.action,
          createdAt: entry.createdAt.toISOString(),
        })),
    };
  }

  async ownDetail(studentId: string, id: string): Promise<StudentReExamApplication> {
    return this.toStudent(await this.ownRecord(studentId, id));
  }

  async ownList(studentId: string): Promise<StudentReExamApplicationList> {
    const apps = await this.prisma.client.reExamApplication.findMany({
      where: { studentId },
      include: { decidedBy: { select: { id: true, displayName: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    return { data: await Promise.all(apps.map((app) => this.toStudent(app))) };
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM re_exam_applications WHERE id = ${id}::uuid FOR UPDATE`;
    const app = await tx.reExamApplication.findUnique({ where: { id } });
    if (!app) throw Errors.notFound();
    return app;
  }

  /** The student withdraws a SUBMITTED application (never a decided one). */
  async cancel(
    studentId: string,
    accountId: string,
    id: string,
  ): Promise<StudentReExamApplication> {
    await this.ownRecord(studentId, id);
    await this.prisma.client.$transaction(async (tx) => {
      const app = await this.lock(tx, id);
      if (app.status !== 'SUBMITTED') {
        throw conflict('Only applications that are still awaiting a decision can be cancelled.');
      }
      await tx.reExamApplication.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: null,
          action: AUDIT_ACTIONS.reExamApplicationCancelled,
          entityType: ENTITY,
          entityId: id,
          metadata: { principal: 'student', studentId, accountId },
        },
        tx,
      );
    });
    return this.ownDetail(studentId, id);
  }

  /**
   * Re-check the fee of a SUBMITTED application whose fee was not configured at submission (e.g.
   * the university has since activated a rule). The attempt number never changes.
   */
  async reassessFee(studentId: string, id: string): Promise<StudentReExamApplication> {
    await this.ownRecord(studentId, id);
    await this.prisma.client.$transaction(async (tx) => {
      const app = await this.lock(tx, id);
      if (app.feeStatus === 'ASSESSED') return;
      if (app.status !== 'SUBMITTED')
        throw conflict('The fee of a decided application cannot change.');
      const fee = await this.fees.assess(tx, app.attemptNumber);
      if (fee.status !== 'ASSESSED') {
        if (fee.blockedReason !== app.feeBlockedReason) {
          await tx.reExamApplication.update({
            where: { id },
            data: { feeBlockedReason: fee.blockedReason },
          });
        }
        return;
      }
      await tx.reExamApplication.update({ where: { id }, data: feeData(fee, new Date()) });
      await this.audit.writeAuditEvent(
        {
          actorUserId: null,
          action: AUDIT_ACTIONS.reExamApplicationFeeAssessed,
          entityType: ENTITY,
          entityId: id,
          metadata: {
            principal: 'student',
            feeRuleVersion: fee.ruleVersion,
            feeAmountMinor: fee.amountMinor,
            feeCurrency: fee.currency,
          },
        },
        tx,
      );
    });
    return this.ownDetail(studentId, id);
  }

  // ------------------------------------------------------------------------------------------
  // Staff
  // ------------------------------------------------------------------------------------------

  private where(query: ReExamApplicationExportQuery): Prisma.ReExamApplicationWhereInput {
    return {
      AND: [
        query.status ? { status: query.status } : {},
        query.examinationId ? { examinationId: query.examinationId } : {},
        query.programId ? { registration: { programId: query.programId } } : {},
        query.academicSessionId
          ? { registration: { academicSessionId: query.academicSessionId } }
          : {},
        query.periodNumber ? { examination: { semesterNumber: query.periodNumber } } : {},
        query.search
          ? {
              OR: [
                { studentName: { contains: query.search, mode: 'insensitive' } },
                { registrationNumber: { contains: query.search, mode: 'insensitive' } },
                { subjectCode: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
  }

  private orderBy(
    query: ReExamApplicationExportQuery,
  ): Prisma.ReExamApplicationOrderByWithRelationInput[] {
    return query.sortBy === 'registrationNumber'
      ? [{ registrationNumber: query.sortOrder }, { id: 'asc' }]
      : [{ submittedAt: query.sortOrder }, { id: 'asc' }];
  }

  async list(query: ReExamApplicationQuery): Promise<ReExamApplicationList> {
    const where = this.where(query);
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.reExamApplication.findMany({
        where,
        include: { decidedBy: { select: { id: true, displayName: true } } },
        orderBy: this.orderBy(query),
        ...pageArgs(query),
      }),
      this.prisma.client.reExamApplication.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: paginationMeta(query, total) };
  }

  async detail(id: string): Promise<ReExamApplicationDetail> {
    const app = await this.prisma.client.reExamApplication.findUnique({
      where: { id },
      include: { decidedBy: { select: { id: true, displayName: true } } },
    });
    if (!app) throw Errors.notFound();
    const history = await this.prisma.client.auditLog.findMany({
      where: { entityType: ENTITY, entityId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { displayName: true } } },
      take: 100,
    });
    return {
      ...toRow(app),
      attemptBasis: app.attemptBasis,
      decisionReason: app.decisionReason,
      decidedBy: app.decidedBy,
      cancelledAt: app.cancelledAt?.toISOString() ?? null,
      history: history.map((entry): ActivityItem => ({
        id: entry.id,
        action: entry.action,
        summary: STAFF_SUMMARIES[entry.action as AuditAction] ?? entry.action,
        actor: entry.actor?.displayName ?? (entry.actorUserId ? null : 'Student'),
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** SUBMITTED → APPROVED. Payment (Phase 9C) is shown to the decider but never decides by itself. */
  async approve(
    id: string,
    input: ApproveReExamApplication,
    actorUserId: string,
  ): Promise<ReExamApplicationDetail> {
    return this.decide(id, 'APPROVED', input.note ?? null, actorUserId);
  }

  async reject(
    id: string,
    input: RejectReExamApplication,
    actorUserId: string,
  ): Promise<ReExamApplicationDetail> {
    return this.decide(id, 'REJECTED', input.reason, actorUserId);
  }

  private async decide(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reason: string | null,
    actorUserId: string,
  ): Promise<ReExamApplicationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const app = await this.lock(tx, id);
      if (app.status !== 'SUBMITTED') {
        throw conflict(`This application is already ${app.status.toLowerCase()}.`);
      }
      await tx.reExamApplication.update({
        where: { id },
        data: {
          status,
          decidedAt: new Date(),
          decidedByUserId: actorUserId,
          decisionReason: reason,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action:
            status === 'APPROVED'
              ? AUDIT_ACTIONS.reExamApplicationApproved
              : AUDIT_ACTIONS.reExamApplicationRejected,
          entityType: ENTITY,
          entityId: id,
          // The reason stays on the application; it is not copied into the log.
          metadata: {
            from: app.status,
            feeStatus: app.feeStatus,
          },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** CSV of the filtered applications (permitted fields only: no receipts, notes or contact data). */
  async exportCsv(query: ReExamApplicationExportQuery, actorUserId: string): Promise<string> {
    const rows = await this.prisma.client.reExamApplication.findMany({
      where: this.where(query),
      include: { decidedBy: { select: { id: true, displayName: true } } },
      orderBy: this.orderBy(query),
      take: EXPORT_LIMIT,
    });
    const header = [
      'Reference',
      'Submitted at',
      'Status',
      'Student name',
      'Registration number',
      'Program code',
      'Academic session',
      'Semester/year',
      'Examination',
      'Examination session',
      'Subject code',
      'Subject name',
      'Attempt',
      'Fee status',
      'Fee',
      'Fee currency',
      'Fee rule version',
      'Decided at',
    ];
    const lines = rows.map((app) =>
      [
        reExamReference(app.id),
        app.submittedAt.toISOString(),
        app.status,
        app.studentName,
        app.registrationNumber,
        app.programCode,
        app.academicSessionName,
        app.periodLabel,
        app.examinationName,
        app.examSession,
        app.subjectCode,
        app.subjectName,
        app.attemptNumber,
        app.feeStatus === 'ASSESSED'
          ? 'ASSESSED'
          : `NOT_CONFIGURED (${app.feeBlockedReason ?? ''})`,
        app.feeAmountMinor !== null && app.feeCurrency
          ? formatMoney(app.feeAmountMinor, app.feeCurrency)
          : '',
        app.feeCurrency,
        app.feeRuleVersion,
        app.decidedAt?.toISOString() ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.reExamApplicationsExported,
      entityType: ENTITY,
      metadata: {
        rows: rows.length,
        // Filter IDs/codes only — a free-text search may contain a person's name, so only its use is logged.
        filters: Object.fromEntries(
          Object.entries({ ...query, search: query.search ? true : undefined }).filter(
            ([, v]) => v !== undefined,
          ),
        ),
      },
    });
    return [header.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
  }
}
