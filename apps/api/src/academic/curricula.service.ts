import { periodNumbers, periodDisplayLabel } from './curriculum-periods.js';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type AddCurriculumSubject,
  type AssignCurriculum,
  type AssignCurriculumResult,
  assignmentRuleIssues,
  type CreateCurriculum,
  type CurriculumDetail,
  type CurriculumList,
  type CurriculumRegistrationList,
  type CurriculumRegistrationQuery,
  type CurriculumSubject,
  type CurriculumSummary,
  ERROR_CODES,
  normalizeRegistrationNumber,
  periodLabel,
  type ReorderCurriculumSubjects,
  type StudentCurriculum,
  type UpdateCurriculum,
  type UpdateCurriculumSubject,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { changedFields, invalidRelation, rethrowAsFieldConflict } from '../common/conflicts.js';
import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';

const VERSION_CONFLICT = {
  program_curricula_program_id_version_code_key: {
    path: 'versionCode',
    message: 'This program already has a curriculum with this version code.',
  },
};

const ASSIGNMENT_ORDER: Prisma.ProgramSubjectOrderByWithRelationInput[] = [
  { semesterNumber: 'asc' },
  { displayOrder: 'asc' },
  { id: 'asc' },
];

const summaryInclude = {
  activatedBy: { select: { id: true, displayName: true } },
  archivedBy: { select: { id: true, displayName: true } },
  _count: { select: { subjects: true, registrations: true } },
} as const;

const detailInclude = {
  ...summaryInclude,
  program: { select: { id: true, code: true, name: true, status: true } },
  subjects: {
    include: {
      subject: { select: { id: true, code: true, name: true, category: true, status: true } },
    },
    orderBy: ASSIGNMENT_ORDER,
  },
} as const;

type SummaryRow = Prisma.ProgramCurriculumGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.ProgramCurriculumGetPayload<{ include: typeof detailInclude }>;
type AssignmentRow = DetailRow['subjects'][number];

const num = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : Number(value);

interface StoredComponent {
  name: string;
  maxMarks: number;
  passMarks: number | null;
}

function componentsOf(value: Prisma.JsonValue | null): StoredComponent[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const list = value.components;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const { name, maxMarks, passMarks } = item;
    if (typeof name !== 'string' || typeof maxMarks !== 'number') return [];
    return [{ name, maxMarks, passMarks: typeof passMarks === 'number' ? passMarks : null }];
  });
}

function componentsJson(
  components: { name: string; maxMarks: number; passMarks?: number | null }[] | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!components || components.length === 0) return Prisma.DbNull;
  return {
    components: components.map((c) => ({
      name: c.name,
      maxMarks: c.maxMarks,
      passMarks: c.passMarks ?? null,
    })),
  };
}

function toSummary(row: SummaryRow): CurriculumSummary {
  return {
    id: row.id,
    programId: row.programId,
    versionCode: row.versionCode,
    name: row.name,
    description: row.description,
    structureType: row.structureType,
    numberOfPeriods: row.numberOfPeriods,
    effectiveFrom: toDateOnly(row.effectiveFrom),
    effectiveTo: toDateOnly(row.effectiveTo),
    status: row.status,
    subjectCount: row._count.subjects,
    registrationCount: row._count.registrations,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    activatedBy: row.activatedBy,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archivedBy: row.archivedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAssignment(row: AssignmentRow): CurriculumSubject {
  return {
    id: row.id,
    subject: row.subject,
    periodNumber: row.semesterNumber,
    displayOrder: row.displayOrder,
    classification: row.classification,
    credits: num(row.credits),
    maxMarks: num(row.maxMarks),
    passMarks: num(row.passMarks),
    components: componentsOf(row.componentConfiguration),
  };
}

function toDetail(row: DetailRow): CurriculumDetail {
  return {
    ...toSummary(row),
    program: row.program,
    periods: periodNumbers(row.numberOfPeriods, row.subjects).map((number) => {
      return {
        number,
        label: periodDisplayLabel(row.structureType, number, row.numberOfPeriods),
        subjects: row.subjects.filter((s) => s.semesterNumber === number).map(toAssignment),
      };
    }),
  };
}

const notEditable = (status: string) =>
  new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.curriculumNotEditable,
    status === 'ACTIVE'
      ? 'This curriculum is active and read-only. Create a new version to change it.'
      : 'This curriculum is archived and read-only.',
  );

const overlap = (versionCode: string) =>
  new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.curriculumOverlap,
    `The effective period overlaps active version ${versionCode} of this program. Set an end date on that version, archive it, or choose different dates.`,
    { details: [{ path: 'effectiveFrom', message: `Overlaps active version ${versionCode}.` }] },
  );

function rangesOverlap(
  a: { from: Date | null; to: Date | null },
  b: { from: Date | null; to: Date | null },
): boolean {
  const aStart = a.from?.getTime() ?? -Infinity;
  const aEnd = a.to?.getTime() ?? Infinity;
  const bStart = b.from?.getTime() ?? -Infinity;
  const bEnd = b.to?.getTime() ?? Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Curriculum versions of a program and their subject assignments (Phase 7B).
 *
 * Every mutation runs in a transaction that locks the curriculum row (and the program row for
 * activation/effective-date changes), re-checks the state, then writes and audits. The database
 * triggers enforce the same rules as a backstop (see migration 20261011090000).
 */
@Injectable()
export class CurriculaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------------------------------

  async listForProgram(programId: string): Promise<CurriculumList> {
    const program = await this.prisma.client.program.findUnique({
      where: { id: programId },
      select: { id: true },
    });
    if (!program) throw Errors.notFound();
    const rows = await this.prisma.client.programCurriculum.findMany({
      where: { programId },
      include: summaryInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return { data: rows.map(toSummary) };
  }

  async get(id: string): Promise<CurriculumDetail> {
    const row = await this.prisma.client.programCurriculum.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!row) throw Errors.notFound();
    return toDetail(row);
  }

  // ------------------------------------------------------------------------------------------
  // Versions
  // ------------------------------------------------------------------------------------------

  async create(
    programId: string,
    input: CreateCurriculum,
    actorUserId: string,
  ): Promise<CurriculumDetail> {
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        const program = await tx.program.findUnique({ where: { id: programId } });
        if (!program) throw Errors.notFound();
        const structureType = input.structureType ?? program.academicStructure;
        const numberOfPeriods = input.numberOfPeriods ?? program.periodCount;
        const missing = [
          ...(structureType
            ? []
            : [{ path: 'structureType', message: 'Choose semester-wise or year-wise.' }]),
          ...(numberOfPeriods
            ? []
            : [{ path: 'numberOfPeriods', message: 'Enter the number of semesters or years.' }]),
        ];
        if (!structureType || !numberOfPeriods) throw Errors.validation(missing);

        if (input.copyFromCurriculumId) {
          await this.lock(tx, input.copyFromCurriculumId, true);
        }
        const source = input.copyFromCurriculumId
          ? await tx.programCurriculum.findUnique({
              where: { id: input.copyFromCurriculumId },
              include: { subjects: true },
            })
          : null;
        if (input.copyFromCurriculumId && source?.programId !== programId) {
          throw invalidRelation('copyFromCurriculumId', 'Choose a version of this program.');
        }
        if (source?.subjects.some((s) => s.semesterNumber > numberOfPeriods)) {
          throw invalidRelation(
            'numberOfPeriods',
            `The copied version uses period ${String(Math.max(...source.subjects.map((s) => s.semesterNumber)))}; increase the number of periods.`,
          );
        }

        const curriculum = await tx.programCurriculum.create({
          data: {
            programId,
            versionCode: input.versionCode,
            name: input.name,
            description: input.description ?? null,
            structureType,
            numberOfPeriods,
            effectiveFrom: fromDateOnly(input.effectiveFrom) ?? null,
            effectiveTo: fromDateOnly(input.effectiveTo) ?? null,
          },
        });
        if (source) {
          for (const line of source.subjects) {
            await tx.programSubject.create({
              data: {
                programId,
                curriculumId: curriculum.id,
                subjectId: line.subjectId,
                semesterNumber: line.semesterNumber,
                displayOrder: line.displayOrder,
                curriculumVersion: curriculum.versionCode,
                classification: line.classification,
                credits: line.credits,
                maxMarks: line.maxMarks,
                passMarks: line.passMarks,
                ...(line.componentConfiguration === null
                  ? {}
                  : { componentConfiguration: line.componentConfiguration }),
              },
            });
          }
        }
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.curriculumCreated,
            entityType: 'ProgramCurriculum',
            entityId: curriculum.id,
            metadata: {
              programId,
              code: program.code,
              versionCode: curriculum.versionCode,
              structureType,
              numberOfPeriods,
              ...(source ? { copiedFrom: source.id, copiedSubjects: source.subjects.length } : {}),
            },
          },
          tx,
        );
        return curriculum.id;
      });
      return await this.get(id);
    } catch (error) {
      rethrowAsFieldConflict(error, VERSION_CONFLICT);
    }
  }

  /** Locks the curriculum row and returns it (404 when missing). */
  private async lock(tx: Prisma.TransactionClient, id: string, shared = false) {
    if (shared)
      await tx.$queryRaw`SELECT id FROM program_curricula WHERE id = ${id}::uuid FOR SHARE`;
    else await tx.$queryRaw`SELECT id FROM program_curricula WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.programCurriculum.findUnique({
      where: { id },
      include: { program: { select: { id: true, code: true, status: true } } },
    });
    if (!row) throw Errors.notFound();
    return row;
  }

  private async lockProgram(tx: Prisma.TransactionClient, programId: string) {
    await tx.$queryRaw`SELECT id FROM programs WHERE id = ${programId}::uuid FOR UPDATE`;
  }

  /** Friendly pre-check for the "no overlapping ACTIVE versions" rule (the trigger is the backstop). */
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    curriculum: { id: string; programId: string },
    range: { from: Date | null; to: Date | null },
  ) {
    const actives = await tx.programCurriculum.findMany({
      where: { programId: curriculum.programId, status: 'ACTIVE', id: { not: curriculum.id } },
      select: { versionCode: true, effectiveFrom: true, effectiveTo: true },
    });
    const clash = actives.find((other) =>
      rangesOverlap(range, { from: other.effectiveFrom, to: other.effectiveTo }),
    );
    if (clash) throw overlap(clash.versionCode);
  }

  async update(
    id: string,
    input: UpdateCurriculum,
    actorUserId: string,
  ): Promise<CurriculumDetail> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        // Keep the same program → curriculum lock order as activation.
        const peek = await tx.programCurriculum.findUnique({
          where: { id },
          select: { programId: true },
        });
        if (!peek) throw Errors.notFound();
        await this.lockProgram(tx, peek.programId);
        const before = await this.lock(tx, id);
        if (before.status === 'ARCHIVED') throw notEditable(before.status);
        if (before.status === 'ACTIVE') {
          const fields = input as Record<string, unknown>;
          const others = Object.keys(fields).filter(
            (key) => key !== 'effectiveTo' && fields[key] !== undefined,
          );
          if (others.length > 0) throw notEditable(before.status);
        }
        const effectiveFrom =
          input.effectiveFrom !== undefined
            ? (fromDateOnly(input.effectiveFrom) ?? null)
            : before.effectiveFrom;
        const effectiveTo =
          input.effectiveTo !== undefined
            ? (fromDateOnly(input.effectiveTo) ?? null)
            : before.effectiveTo;
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
          throw invalidRelation('effectiveTo', 'The end date must be on or after the start date.');
        }
        if (before.status === 'ACTIVE') {
          await this.assertNoOverlap(tx, before, { from: effectiveFrom, to: effectiveTo });
        }
        if (input.numberOfPeriods !== undefined && input.numberOfPeriods < before.numberOfPeriods) {
          const beyond = await tx.programSubject.count({
            where: { curriculumId: id, semesterNumber: { gt: input.numberOfPeriods } },
          });
          if (beyond > 0) {
            throw invalidRelation(
              'numberOfPeriods',
              `Subjects are assigned beyond period ${String(input.numberOfPeriods)}. Move or remove them first.`,
            );
          }
        }
        const row = await tx.programCurriculum.update({
          where: { id },
          data: {
            ...(input.versionCode !== undefined ? { versionCode: input.versionCode } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description ?? null } : {}),
            ...(input.structureType !== undefined ? { structureType: input.structureType } : {}),
            ...(input.numberOfPeriods !== undefined
              ? { numberOfPeriods: input.numberOfPeriods }
              : {}),
            effectiveFrom,
            effectiveTo,
          },
        });
        const changed = changedFields(before, row, [
          'versionCode',
          'name',
          'description',
          'structureType',
          'numberOfPeriods',
          'effectiveFrom',
          'effectiveTo',
        ]);
        if (changed.length > 0) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.curriculumUpdated,
              entityType: 'ProgramCurriculum',
              entityId: id,
              metadata: {
                code: before.program.code,
                versionCode: row.versionCode,
                changedFields: changed,
              },
            },
            tx,
          );
        }
      });
      return await this.get(id);
    } catch (error) {
      rethrowAsFieldConflict(error, VERSION_CONFLICT);
    }
  }

  async activate(id: string, actorUserId: string): Promise<CurriculumDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      // Program lock first: concurrent activations of one program are serialised.
      const peek = await tx.programCurriculum.findUnique({
        where: { id },
        select: { programId: true },
      });
      if (!peek) throw Errors.notFound();
      await this.lockProgram(tx, peek.programId);
      const curriculum = await this.lock(tx, id);
      if (curriculum.status !== 'DRAFT') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.curriculumNotEditable,
          `Only a draft can be activated; this version is ${curriculum.status.toLowerCase()}.`,
        );
      }
      if (curriculum.program.status !== 'ACTIVE') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.conflict,
          'The program is inactive. Activate the program before activating a curriculum.',
        );
      }
      const subjects = await tx.programSubject.count({ where: { curriculumId: id } });
      if (subjects === 0) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.conflict,
          'Add at least one subject before activating this curriculum.',
        );
      }
      const outside = await tx.programSubject.count({
        where: { curriculumId: id, semesterNumber: { gt: curriculum.numberOfPeriods } },
      });
      if (outside > 0) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.conflict,
          'Subjects exist outside the declared periods. Review the legacy structure before activating this curriculum.',
        );
      }
      await this.assertNoOverlap(tx, curriculum, {
        from: curriculum.effectiveFrom,
        to: curriculum.effectiveTo,
      });
      await tx.programCurriculum.update({
        where: { id },
        data: { status: 'ACTIVE', activatedAt: new Date(), activatedByUserId: actorUserId },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.curriculumActivated,
          entityType: 'ProgramCurriculum',
          entityId: id,
          metadata: {
            code: curriculum.program.code,
            versionCode: curriculum.versionCode,
            subjects,
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async archive(id: string, actorUserId: string): Promise<CurriculumDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const curriculum = await this.lock(tx, id);
      if (curriculum.status === 'ARCHIVED') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.curriculumNotEditable,
          'This curriculum is already archived.',
        );
      }
      await tx.programCurriculum.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: new Date(), archivedByUserId: actorUserId },
      });
      const registrations = await tx.studentRegistration.count({ where: { curriculumId: id } });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.curriculumArchived,
          entityType: 'ProgramCurriculum',
          entityId: id,
          metadata: {
            code: curriculum.program.code,
            versionCode: curriculum.versionCode,
            from: curriculum.status,
            registrations,
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  // ------------------------------------------------------------------------------------------
  // Subject assignments (DRAFT only)
  // ------------------------------------------------------------------------------------------

  private async lockDraft(tx: Prisma.TransactionClient, id: string) {
    const curriculum = await this.lock(tx, id);
    if (curriculum.status !== 'DRAFT') throw notEditable(curriculum.status);
    return curriculum;
  }

  private checkPeriod(
    period: number,
    numberOfPeriods: number,
    structure: 'SEMESTER_WISE' | 'YEAR_WISE',
  ) {
    if (period > numberOfPeriods) {
      throw invalidRelation(
        'periodNumber',
        `This curriculum has ${String(numberOfPeriods)} ${structure === 'YEAR_WISE' ? 'year' : 'semester'}${numberOfPeriods === 1 ? '' : 's'}; choose ${periodLabel(structure, 1)}–${String(numberOfPeriods)}.`,
      );
    }
  }

  async addSubject(
    curriculumId: string,
    input: AddCurriculumSubject,
    actorUserId: string,
  ): Promise<CurriculumDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const curriculum = await this.lockDraft(tx, curriculumId);
      this.checkPeriod(input.periodNumber, curriculum.numberOfPeriods, curriculum.structureType);
      const subject = await tx.subject.findUnique({ where: { id: input.subjectId } });
      if (!subject) throw invalidRelation('subjectId', 'Choose a subject from the catalogue.');
      if (subject.status !== 'ACTIVE') {
        throw invalidRelation('subjectId', 'This subject is inactive. Choose an active subject.');
      }
      const existing = await tx.programSubject.findUnique({
        where: { curriculumId_subjectId: { curriculumId, subjectId: subject.id } },
        select: { semesterNumber: true },
      });
      if (existing) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.conflict,
          `${subject.code} is already in this curriculum (${periodLabel(curriculum.structureType, existing.semesterNumber)}).`,
          { details: [{ path: 'subjectId', message: 'Already in this curriculum.' }] },
        );
      }
      const last = await tx.programSubject.aggregate({
        where: { curriculumId, semesterNumber: input.periodNumber },
        _max: { displayOrder: true },
      });
      await tx.programSubject.create({
        data: {
          programId: curriculum.programId,
          curriculumId,
          subjectId: subject.id,
          semesterNumber: input.periodNumber,
          displayOrder: (last._max.displayOrder ?? -1) + 1,
          curriculumVersion: curriculum.versionCode,
          classification: input.classification,
          credits: input.credits ?? null,
          maxMarks: input.maxMarks ?? null,
          passMarks: input.passMarks ?? null,
          componentConfiguration: this.json(input.components),
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.curriculumSubjectAdded,
          entityType: 'ProgramCurriculum',
          entityId: curriculumId,
          metadata: {
            code: curriculum.program.code,
            versionCode: curriculum.versionCode,
            subjectCode: subject.code,
            periodNumber: input.periodNumber,
          },
        },
        tx,
      );
    });
    return this.get(curriculumId);
  }

  private json(components: AddCurriculumSubject['components']) {
    return componentsJson(components);
  }

  async updateSubject(
    curriculumId: string,
    assignmentId: string,
    input: UpdateCurriculumSubject,
    actorUserId: string,
  ): Promise<CurriculumDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const curriculum = await this.lockDraft(tx, curriculumId);
      const before = await tx.programSubject.findFirst({
        where: { id: assignmentId, curriculumId },
        include: { subject: { select: { code: true } } },
      });
      if (!before) throw Errors.notFound();
      const periodNumber = input.periodNumber ?? before.semesterNumber;
      this.checkPeriod(periodNumber, curriculum.numberOfPeriods, curriculum.structureType);
      const merged = {
        maxMarks: input.maxMarks !== undefined ? input.maxMarks : num(before.maxMarks),
        passMarks: input.passMarks !== undefined ? input.passMarks : num(before.passMarks),
        components: input.components ?? componentsOf(before.componentConfiguration),
      };
      const issues = assignmentRuleIssues(merged);
      if (issues.length > 0) throw Errors.validation(issues);
      let displayOrder = before.displayOrder;
      if (periodNumber !== before.semesterNumber) {
        const last = await tx.programSubject.aggregate({
          where: { curriculumId, semesterNumber: periodNumber },
          _max: { displayOrder: true },
        });
        displayOrder = (last._max.displayOrder ?? -1) + 1;
      }
      const row = await tx.programSubject.update({
        where: { id: assignmentId },
        data: {
          semesterNumber: periodNumber,
          displayOrder,
          ...(input.classification !== undefined ? { classification: input.classification } : {}),
          ...(input.credits !== undefined ? { credits: input.credits } : {}),
          ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
          ...(input.passMarks !== undefined ? { passMarks: input.passMarks } : {}),
          ...(input.components !== undefined
            ? { componentConfiguration: this.json(input.components) }
            : {}),
        },
      });
      const comparable = (line: typeof before | typeof row) => ({
        periodNumber: line.semesterNumber,
        classification: line.classification,
        credits: line.credits?.toString() ?? null,
        maxMarks: line.maxMarks?.toString() ?? null,
        passMarks: line.passMarks?.toString() ?? null,
        components: JSON.stringify(componentsOf(line.componentConfiguration)),
      });
      const changed = changedFields(comparable(before), comparable(row), [
        'periodNumber',
        'classification',
        'credits',
        'maxMarks',
        'passMarks',
        'components',
      ]);
      if (changed.length > 0) {
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.curriculumSubjectUpdated,
            entityType: 'ProgramCurriculum',
            entityId: curriculumId,
            metadata: {
              code: curriculum.program.code,
              versionCode: curriculum.versionCode,
              subjectCode: before.subject.code,
              changedFields: changed,
            },
          },
          tx,
        );
      }
    });
    return this.get(curriculumId);
  }

  async removeSubject(
    curriculumId: string,
    assignmentId: string,
    actorUserId: string,
  ): Promise<CurriculumDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const curriculum = await this.lockDraft(tx, curriculumId);
      const line = await tx.programSubject.findFirst({
        where: { id: assignmentId, curriculumId },
        include: { subject: { select: { code: true } } },
      });
      if (!line) throw Errors.notFound();
      await tx.programSubject.delete({ where: { id: assignmentId } });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.curriculumSubjectRemoved,
          entityType: 'ProgramCurriculum',
          entityId: curriculumId,
          metadata: {
            code: curriculum.program.code,
            versionCode: curriculum.versionCode,
            subjectCode: line.subject.code,
            periodNumber: line.semesterNumber,
          },
        },
        tx,
      );
    });
    return this.get(curriculumId);
  }

  async reorder(
    curriculumId: string,
    input: ReorderCurriculumSubjects,
    actorUserId: string,
  ): Promise<CurriculumDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const curriculum = await this.lockDraft(tx, curriculumId);
      const lines = await tx.programSubject.findMany({
        where: { curriculumId, semesterNumber: input.periodNumber },
        select: { id: true },
      });
      const current = new Set(lines.map((line) => line.id));
      if (
        current.size !== input.assignmentIds.length ||
        input.assignmentIds.some((assignmentId) => !current.has(assignmentId))
      ) {
        throw invalidRelation(
          'assignmentIds',
          'List every subject of this semester or year exactly once.',
        );
      }
      for (const [index, assignmentId] of input.assignmentIds.entries()) {
        await tx.programSubject.update({
          where: { id: assignmentId },
          data: { displayOrder: index },
        });
      }
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.curriculumSubjectsReordered,
          entityType: 'ProgramCurriculum',
          entityId: curriculumId,
          metadata: {
            code: curriculum.program.code,
            versionCode: curriculum.versionCode,
            periodNumber: input.periodNumber,
          },
        },
        tx,
      );
    });
    return this.get(curriculumId);
  }

  // ------------------------------------------------------------------------------------------
  // Registrations ↔ curriculum (explicit staff action; never automatic)
  // ------------------------------------------------------------------------------------------

  async registrations(
    curriculumId: string,
    query: CurriculumRegistrationQuery,
  ): Promise<CurriculumRegistrationList> {
    const curriculum = await this.prisma.client.programCurriculum.findUnique({
      where: { id: curriculumId },
      select: { programId: true },
    });
    if (!curriculum) throw Errors.notFound();
    const where: Prisma.StudentRegistrationWhereInput = {
      AND: [
        { programId: curriculum.programId },
        query.academicSessionId ? { academicSessionId: query.academicSessionId } : {},
        query.assignment === 'unassigned' ? { curriculumId: null } : {},
        query.assignment === 'this' ? { curriculumId } : {},
        query.assignment === 'other'
          ? { curriculumId: { not: curriculumId }, NOT: { curriculumId: null } }
          : {},
        query.search
          ? {
              OR: [
                {
                  registrationNumberNormalized: {
                    contains: normalizeRegistrationNumber(query.search),
                  },
                },
                { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const orderBy: Prisma.StudentRegistrationOrderByWithRelationInput[] =
      query.sortBy === 'studentName'
        ? [{ student: { fullName: query.sortOrder } }, { id: 'asc' }]
        : [{ registrationNumberNormalized: query.sortOrder }, { id: 'asc' }];
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.studentRegistration.findMany({
        where,
        include: {
          student: { select: { id: true, fullName: true } },
          academicSession: { select: { id: true, code: true, name: true } },
          curriculum: { select: { id: true, versionCode: true, name: true, status: true } },
        },
        orderBy,
        ...pageArgs(query),
      }),
      this.prisma.client.studentRegistration.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        registrationId: row.id,
        registrationNumber: row.registrationNumber,
        studentId: row.student.id,
        studentName: row.student.fullName,
        academicSession: row.academicSession,
        status: row.status,
        curriculum: row.curriculum,
      })),
      meta: paginationMeta(query, total),
    };
  }

  async assign(
    curriculumId: string,
    input: AssignCurriculum,
    actorUserId: string,
  ): Promise<AssignCurriculumResult> {
    return this.prisma.client.$transaction(async (tx) => {
      const curriculum = await this.lock(tx, curriculumId, true);
      if (curriculum.status !== 'ACTIVE') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.curriculumNotEditable,
          'Only an active curriculum can be assigned to registrations.',
        );
      }
      // Serialize reassignment decisions against other staff and registration edits.
      await tx.$queryRaw`SELECT id FROM student_registrations WHERE id IN (${Prisma.join(input.registrationIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
      const rows = await tx.studentRegistration.findMany({
        where: { id: { in: input.registrationIds } },
        select: {
          id: true,
          registrationNumber: true,
          programId: true,
          curriculumId: true,
          curriculum: { select: { versionCode: true } },
          _count: { select: { results: true } },
        },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const skipped: AssignCurriculumResult['skipped'] = [];
      const eligible: string[] = [];
      let replaced = 0;
      for (const registrationId of input.registrationIds) {
        const row = byId.get(registrationId);
        if (row?.programId !== curriculum.programId) {
          skipped.push({
            registrationId,
            registrationNumber: row?.registrationNumber ?? null,
            reason: 'Not a registration of this program.',
          });
        } else if (row.curriculumId === curriculumId) {
          skipped.push({
            registrationId,
            registrationNumber: row.registrationNumber,
            reason: 'Already assigned to this version.',
          });
        } else if (row._count.results > 0) {
          skipped.push({
            registrationId,
            registrationNumber: row.registrationNumber,
            reason: 'Has historical results; its curriculum cannot be assigned or changed.',
          });
        } else if (row.curriculumId !== null && !input.replaceExisting) {
          skipped.push({
            registrationId,
            registrationNumber: row.registrationNumber,
            reason: `Follows version ${row.curriculum?.versionCode ?? ''}. Confirm replacing to move it.`,
          });
        } else {
          if (row.curriculumId !== null) replaced += 1;
          eligible.push(registrationId);
        }
      }
      if (eligible.length > 0) {
        await tx.studentRegistration.updateMany({
          where: { id: { in: eligible } },
          data: { curriculumId },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.studentCurriculumAssigned,
            entityType: 'ProgramCurriculum',
            entityId: curriculumId,
            metadata: {
              code: curriculum.program.code,
              versionCode: curriculum.versionCode,
              assigned: eligible.length,
              replaced,
              registrationIds: eligible,
            },
          },
          tx,
        );
      }
      return { assigned: eligible.length, skipped };
    });
  }

  // ------------------------------------------------------------------------------------------
  // Student portal (own registrations only)
  // ------------------------------------------------------------------------------------------

  async forStudent(studentId: string): Promise<StudentCurriculum> {
    const registrations = await this.prisma.client.studentRegistration.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        program: { select: { id: true, code: true, name: true } },
        curriculum: {
          include: {
            subjects: {
              include: { subject: { select: { code: true, name: true } } },
              orderBy: ASSIGNMENT_ORDER,
            },
          },
        },
      },
    });
    return {
      registrations: registrations.map((registration) => {
        const curriculum = registration.curriculum;
        return {
          registrationId: registration.id,
          registrationNumber: registration.registrationNumber,
          program: registration.program,
          curriculum: curriculum
            ? {
                versionCode: curriculum.versionCode,
                name: curriculum.name,
                structureType: curriculum.structureType,
                numberOfPeriods: curriculum.numberOfPeriods,
                status: curriculum.status,
                periods: periodNumbers(curriculum.numberOfPeriods, curriculum.subjects).map(
                  (number) => ({
                    number,
                    label: periodDisplayLabel(
                      curriculum.structureType,
                      number,
                      curriculum.numberOfPeriods,
                    ),
                    subjects: curriculum.subjects
                      .filter((line) => line.semesterNumber === number)
                      .map((line) => ({
                        code: line.subject.code,
                        name: line.subject.name,
                        classification: line.classification,
                        credits: num(line.credits),
                      })),
                  }),
                ),
              }
            : null,
        };
      }),
    };
  }
}
