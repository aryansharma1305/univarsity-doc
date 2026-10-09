import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS, type AuditAction } from '@docversity/types';
import {
  type ActivityItem,
  type CreateExamination,
  type CreateExternalExamApp,
  ERROR_CODES,
  type ExaminationDetail,
  type ExaminationList,
  type ExaminationQuery,
  type ExaminationRow,
  type ExternalExamApp,
  type ExternalExamAppList,
  periodLabel,
  type StudentExaminations,
  type UpdateExamination,
  type UpdateExternalExamApp,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { changedFields, invalidRelation, rethrowAsFieldConflict } from '../common/conflicts.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';

const APP_ENTITY = 'ExternalExamApplication';
const EXAM_ENTITY = 'Examination';

const CODE_CONFLICT = {
  examinations_code_key: { path: 'code', message: 'An examination with this code already exists.' },
};

const SUMMARIES: Partial<Record<AuditAction, string>> = {
  EXAMINATION_CREATED: 'Examination record created',
  EXAMINATION_UPDATED: 'Draft details updated',
  EXAMINATION_OPENED: 'Opened (visible to students)',
  EXAMINATION_ARCHIVED: 'Archived',
  EXAMINATION_RE_EXAM_APPLICATIONS_OPENED: 'Re-exam applications opened',
  EXAMINATION_RE_EXAM_APPLICATIONS_CLOSED: 'Re-exam applications closed',
};

const examInclude = {
  program: { select: { id: true, code: true, name: true } },
  academicSession: { select: { id: true, code: true, name: true } },
  curriculum: {
    select: { id: true, versionCode: true, name: true, structureType: true, numberOfPeriods: true },
  },
} as const;
type ExamRecord = Prisma.ExaminationGetPayload<{ include: typeof examInclude }>;

function toRow(exam: ExamRecord): ExaminationRow {
  return {
    id: exam.id,
    code: exam.code,
    name: exam.name,
    kind: exam.kind,
    examType: exam.examType,
    examSession: exam.examSession,
    status: exam.status,
    program: exam.program,
    curriculum: exam.curriculum,
    academicSession: exam.academicSession,
    period: {
      number: exam.semesterNumber,
      // Records created before Phase 9 have no curriculum; their number was always a semester.
      label: periodLabel(exam.curriculum?.structureType ?? 'SEMESTER_WISE', exam.semesterNumber),
    },
    reExamApplicationsOpen: exam.reExamApplicationsOpen,
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
  };
}

type AppRecord = Prisma.ExternalExamApplicationGetPayload<{
  include: { updatedBy: { select: { id: true; displayName: true } } };
}>;

function toApp(app: AppRecord): ExternalExamApp {
  return {
    id: app.id,
    name: app.name,
    websiteUrl: app.websiteUrl,
    androidUrl: app.androidUrl,
    iosUrl: app.iosUrl,
    instructions: app.instructions,
    isActive: app.isActive,
    updatedAt: app.updatedAt.toISOString(),
    updatedBy: app.updatedBy,
  };
}

const notEditable = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);

/**
 * Phase 9A: links to the university's external examination application, and examination RECORDS
 * tied to a curriculum version and one of its periods. No schedules, no eligibility, no
 * examination-taking: the examination happens in the university's own application.
 */
@Injectable()
export class ExaminationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------------------------------
  // External examination application links
  // ------------------------------------------------------------------------------------------

  async listApps(): Promise<ExternalExamAppList> {
    const apps = await this.prisma.client.externalExamApplication.findMany({
      include: { updatedBy: { select: { id: true, displayName: true } } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return { data: apps.map(toApp) };
  }

  async createApp(input: CreateExternalExamApp, actorUserId: string): Promise<ExternalExamApp> {
    const app = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.externalExamApplication.create({
        data: {
          name: input.name,
          websiteUrl: input.websiteUrl,
          androidUrl: input.androidUrl ?? null,
          iosUrl: input.iosUrl ?? null,
          instructions: input.instructions ?? null,
          isActive: input.isActive,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        include: { updatedBy: { select: { id: true, displayName: true } } },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.externalExamAppCreated,
          entityType: APP_ENTITY,
          entityId: created.id,
          metadata: { isActive: created.isActive },
        },
        tx,
      );
      return created;
    });
    return toApp(app);
  }

  async updateApp(
    id: string,
    input: UpdateExternalExamApp,
    actorUserId: string,
  ): Promise<ExternalExamApp> {
    const app = await this.prisma.client.$transaction(async (tx) => {
      const before = await tx.externalExamApplication.findUnique({ where: { id } });
      if (!before) throw Errors.notFound();
      const after = await tx.externalExamApplication.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
          ...(input.androidUrl !== undefined ? { androidUrl: input.androidUrl ?? null } : {}),
          ...(input.iosUrl !== undefined ? { iosUrl: input.iosUrl ?? null } : {}),
          ...(input.instructions !== undefined ? { instructions: input.instructions ?? null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedByUserId: actorUserId,
        },
        include: { updatedBy: { select: { id: true, displayName: true } } },
      });
      const changed = changedFields(before, after, [
        'name',
        'websiteUrl',
        'androidUrl',
        'iosUrl',
        'instructions',
        'isActive',
      ]);
      if (changed.length > 0) {
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.externalExamAppUpdated,
            entityType: APP_ENTITY,
            entityId: id,
            metadata: { changedFields: changed, isActive: after.isActive },
          },
          tx,
        );
      }
      return after;
    });
    return toApp(app);
  }

  // ------------------------------------------------------------------------------------------
  // Examination records
  // ------------------------------------------------------------------------------------------

  async list(query: ExaminationQuery): Promise<ExaminationList> {
    const where: Prisma.ExaminationWhereInput = {
      AND: [
        query.programId ? { programId: query.programId } : {},
        query.curriculumId ? { curriculumId: query.curriculumId } : {},
        query.academicSessionId ? { academicSessionId: query.academicSessionId } : {},
        query.kind ? { kind: query.kind } : {},
        query.status ? { status: query.status } : {},
        query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
                { examSession: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const orderBy: Prisma.ExaminationOrderByWithRelationInput[] =
      query.sortBy === 'code'
        ? [{ code: query.sortOrder }, { id: 'asc' }]
        : [{ createdAt: query.sortOrder }, { id: 'asc' }];
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.examination.findMany({
        where,
        include: examInclude,
        orderBy,
        ...pageArgs(query),
      }),
      this.prisma.client.examination.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: paginationMeta(query, total) };
  }

  async detail(id: string): Promise<ExaminationDetail> {
    const exam = await this.prisma.client.examination.findUnique({
      where: { id },
      include: examInclude,
    });
    if (!exam) throw Errors.notFound();
    const history = await this.prisma.client.auditLog.findMany({
      where: { entityType: EXAM_ENTITY, entityId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { displayName: true } } },
      take: 100,
    });
    return {
      ...toRow(exam),
      history: history.map((entry): ActivityItem => ({
        id: entry.id,
        action: entry.action,
        summary: SUMMARIES[entry.action as AuditAction] ?? entry.action,
        actor: entry.actor?.displayName ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** The curriculum must be ACTIVE or ARCHIVED (never an editable draft) and own the period. */
  private async checkCurriculumPeriod(
    tx: Prisma.TransactionClient,
    curriculumId: string,
    periodNumber: number,
  ) {
    const curriculum = await tx.programCurriculum.findUnique({
      where: { id: curriculumId },
      select: {
        id: true,
        programId: true,
        status: true,
        numberOfPeriods: true,
        structureType: true,
      },
    });
    if (!curriculum)
      throw invalidRelation('curriculumId', 'Choose an existing curriculum version.');
    if (curriculum.status === 'DRAFT') {
      throw invalidRelation(
        'curriculumId',
        'Activate the curriculum version first; draft versions can still change.',
      );
    }
    if (periodNumber > curriculum.numberOfPeriods) {
      throw invalidRelation(
        'periodNumber',
        `This curriculum has ${String(curriculum.numberOfPeriods)} ${curriculum.structureType === 'YEAR_WISE' ? 'year(s)' : 'semester(s)'}.`,
      );
    }
    return curriculum;
  }

  private async checkSession(tx: Prisma.TransactionClient, academicSessionId: string) {
    const session = await tx.academicSession.findUnique({
      where: { id: academicSessionId },
      select: { status: true },
    });
    if (!session)
      throw invalidRelation('academicSessionId', 'Choose an existing academic session.');
    if (session.status === 'ARCHIVED') {
      throw invalidRelation('academicSessionId', 'Archived academic sessions cannot be used.');
    }
  }

  async create(input: CreateExamination, actorUserId: string): Promise<ExaminationDetail> {
    let id: string;
    try {
      id = await this.prisma.client.$transaction(async (tx) => {
        const curriculum = await this.checkCurriculumPeriod(
          tx,
          input.curriculumId,
          input.periodNumber,
        );
        await this.checkSession(tx, input.academicSessionId);
        const exam = await tx.examination.create({
          data: {
            code: input.code,
            name: input.name,
            programId: curriculum.programId,
            curriculumId: curriculum.id,
            academicSessionId: input.academicSessionId,
            semesterNumber: input.periodNumber,
            kind: input.kind,
            examSession: input.examSession,
            examType: input.examType ?? null,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.examinationCreated,
            entityType: EXAM_ENTITY,
            entityId: exam.id,
            metadata: {
              code: exam.code,
              kind: exam.kind,
              programId: exam.programId,
              curriculumId: curriculum.id,
              periodNumber: exam.semesterNumber,
            },
          },
          tx,
        );
        return exam.id;
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
    return this.detail(id);
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM examinations WHERE id = ${id}::uuid FOR UPDATE`;
    const exam = await tx.examination.findUnique({ where: { id } });
    if (!exam) throw Errors.notFound();
    return exam;
  }

  async update(
    id: string,
    input: UpdateExamination,
    actorUserId: string,
  ): Promise<ExaminationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== 'DRAFT') {
        throw notEditable('Only draft examination records can be edited.');
      }
      if (input.periodNumber !== undefined && before.curriculumId) {
        await this.checkCurriculumPeriod(tx, before.curriculumId, input.periodNumber);
      }
      if (input.academicSessionId !== undefined) {
        await this.checkSession(tx, input.academicSessionId);
      }
      const after = await tx.examination.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.academicSessionId !== undefined
            ? { academicSessionId: input.academicSessionId }
            : {}),
          ...(input.periodNumber !== undefined ? { semesterNumber: input.periodNumber } : {}),
          ...(input.examSession !== undefined ? { examSession: input.examSession } : {}),
          ...(input.examType !== undefined ? { examType: input.examType ?? null } : {}),
        },
      });
      const changed = changedFields(before, after, [
        'name',
        'academicSessionId',
        'semesterNumber',
        'examSession',
        'examType',
      ]);
      if (changed.length > 0) {
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.examinationUpdated,
            entityType: EXAM_ENTITY,
            entityId: id,
            metadata: { changedFields: changed },
          },
          tx,
        );
      }
    });
    return this.detail(id);
  }

  /** DRAFT → OPEN: the record becomes visible to students of that curriculum. */
  async open(id: string, actorUserId: string): Promise<ExaminationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const exam = await this.lock(tx, id);
      if (exam.status !== 'DRAFT') {
        throw notEditable(`This examination is already ${exam.status.toLowerCase()}.`);
      }
      if (!exam.curriculumId) {
        throw notEditable('Only examinations linked to a curriculum version can be opened.');
      }
      await tx.examination.update({ where: { id }, data: { status: 'OPEN' } });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.examinationOpened,
          entityType: EXAM_ENTITY,
          entityId: id,
          metadata: { from: exam.status },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** DRAFT/OPEN → ARCHIVED (also closes re-exam applications). The record stays readable. */
  async archive(id: string, actorUserId: string): Promise<ExaminationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const exam = await this.lock(tx, id);
      if (exam.status !== 'DRAFT' && exam.status !== 'OPEN') {
        throw notEditable(`A ${exam.status.toLowerCase()} examination cannot be archived here.`);
      }
      await tx.examination.update({
        where: { id },
        data: { status: 'ARCHIVED', reExamApplicationsOpen: false },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.examinationArchived,
          entityType: EXAM_ENTITY,
          entityId: id,
          metadata: { from: exam.status },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Open or close re-exam applications (re-examinations that are OPEN only). */
  async setReExamApplications(
    id: string,
    open: boolean,
    actorUserId: string,
  ): Promise<ExaminationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const exam = await this.lock(tx, id);
      if (open) {
        if (exam.kind !== 'RE_EXAMINATION') {
          throw notEditable('Only re-examinations accept re-exam applications.');
        }
        if (exam.status !== 'OPEN') {
          throw notEditable('Open the examination record before accepting applications.');
        }
      }
      if (exam.reExamApplicationsOpen === open) return;
      await tx.examination.update({ where: { id }, data: { reExamApplicationsOpen: open } });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: open
            ? AUDIT_ACTIONS.examinationReExamApplicationsOpened
            : AUDIT_ACTIONS.examinationReExamApplicationsClosed,
          entityType: EXAM_ENTITY,
          entityId: id,
          metadata: {},
        },
        tx,
      );
    });
    return this.detail(id);
  }

  // ------------------------------------------------------------------------------------------
  // Student
  // ------------------------------------------------------------------------------------------

  async forStudent(studentId: string): Promise<StudentExaminations> {
    const [apps, registrations] = await Promise.all([
      this.prisma.client.externalExamApplication.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.studentRegistration.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        include: {
          program: { select: { id: true, code: true, name: true } },
          academicSession: { select: { id: true, code: true, name: true } },
          curriculum: {
            select: {
              id: true,
              versionCode: true,
              name: true,
              structureType: true,
              numberOfPeriods: true,
              examinations: {
                where: { status: 'OPEN' },
                orderBy: [{ semesterNumber: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      }),
    ]);
    return {
      applications: apps.map((app) => ({
        id: app.id,
        name: app.name,
        websiteUrl: app.websiteUrl,
        androidUrl: app.androidUrl,
        iosUrl: app.iosUrl,
        instructions: app.instructions,
      })),
      registrations: registrations.map((registration) => {
        const curriculum = registration.curriculum;
        return {
          registrationId: registration.id,
          registrationNumber: registration.registrationNumber,
          program: registration.program,
          academicSession: registration.academicSession,
          curriculum: curriculum
            ? {
                versionCode: curriculum.versionCode,
                name: curriculum.name,
                structureType: curriculum.structureType,
                periods: Array.from({ length: curriculum.numberOfPeriods }, (_, index) => ({
                  number: index + 1,
                  label: periodLabel(curriculum.structureType, index + 1),
                })),
              }
            : null,
          examinations: (curriculum?.examinations ?? []).map((exam) => ({
            id: exam.id,
            name: exam.name,
            kind: exam.kind,
            examSession: exam.examSession,
            examType: exam.examType,
            period: {
              number: exam.semesterNumber,
              label: periodLabel(curriculum?.structureType ?? 'SEMESTER_WISE', exam.semesterNumber),
            },
            reExamApplicationsOpen: exam.reExamApplicationsOpen,
          })),
        };
      }),
    };
  }
}
