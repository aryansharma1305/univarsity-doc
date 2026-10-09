import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type CreateSubject,
  ERROR_CODES,
  type Subject,
  type SubjectList,
  type SubjectQuery,
  type UpdateSubject,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { changedFields, rethrowAsFieldConflict } from '../common/conflicts.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';

const CODE_CONFLICT = {
  subjects_code_version_key: {
    path: 'code',
    message: 'A subject with this code already exists. Reuse it from the catalogue.',
  },
};

const historyUsage = {
  OR: [{ curriculum: { status: { not: 'DRAFT' as const } } }, { resultItems: { some: {} } }],
};
const include = {
  _count: { select: { programSubjects: true } },
  programSubjects: { where: historyUsage, select: { id: true }, take: 1 },
} as const;
type SubjectRow = Prisma.SubjectGetPayload<{ include: typeof include }>;

export function toSubject(row: SubjectRow): Subject {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    defaultCredits: row.defaultCredits === null ? null : Number(row.defaultCredits),
    status: row.status,
    usageCount: row._count.programSubjects,
    historyLocked: row.programSubjects.length > 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Subject catalogue (Phase 7B). A subject is a reusable definition (code, title, category); how it
 * is taught and assessed in a course lives on the curriculum assignment. The catalogue uses
 * version 1 of the Phase 2 (code, version) key; codes are stored upper-case and also checked
 * case-insensitively, so a subject cannot be duplicated by case.
 */
@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: SubjectQuery): Promise<SubjectList> {
    const where: Prisma.SubjectWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.subject.findMany({
        where,
        include,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.subject.count({ where }),
    ]);
    return { data: rows.map(toSubject), meta: paginationMeta(query, total) };
  }

  async get(id: string): Promise<Subject> {
    const row = await this.prisma.client.subject.findUnique({ where: { id }, include });
    if (!row) throw Errors.notFound();
    return toSubject(row);
  }

  private async assertCodeFree(tx: Prisma.TransactionClient, code: string, exceptId?: string) {
    const existing = await tx.subject.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      const detail = CODE_CONFLICT.subjects_code_version_key;
      throw new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, detail.message, {
        details: [detail],
      });
    }
  }

  async create(input: CreateSubject, actorUserId: string): Promise<Subject> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.assertCodeFree(tx, input.code);
        const row = await tx.subject.create({
          data: {
            code: input.code,
            version: 1,
            name: input.name,
            description: input.description ?? null,
            category: input.category,
            defaultCredits: input.defaultCredits ?? null,
            status: input.status,
          },
          include,
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.subjectCreated,
            entityType: 'Subject',
            entityId: row.id,
            metadata: { code: row.code, category: row.category },
          },
          tx,
        );
        return toSubject(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }

  async update(id: string, input: UpdateSubject, actorUserId: string): Promise<Subject> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM subjects WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await tx.subject.findUnique({ where: { id }, include });
        if (!before) throw Errors.notFound();
        const identityFields = ['code', 'name', 'category'] as const;
        if (
          before.programSubjects.length > 0 &&
          identityFields.some(
            (field) => input[field] !== undefined && input[field] !== before[field],
          )
        ) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ERROR_CODES.conflict,
            'This subject is used in academic history. Keep its code, title and category; create a new catalogue subject for changes.',
          );
        }
        if (input.code !== undefined && input.code !== before.code) {
          await this.assertCodeFree(tx, input.code, id);
        }
        const row = await tx.subject.update({ where: { id }, data: input, include });
        const changed = changedFields(
          { ...before, defaultCredits: before.defaultCredits?.toString() ?? null },
          { ...row, defaultCredits: row.defaultCredits?.toString() ?? null },
          ['code', 'name', 'description', 'category', 'defaultCredits'],
        );
        if (changed.length > 0) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.subjectUpdated,
              entityType: 'Subject',
              entityId: id,
              metadata: { code: row.code, changedFields: changed },
            },
            tx,
          );
        }
        if (before.status !== row.status) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.subjectStatusChanged,
              entityType: 'Subject',
              entityId: id,
              metadata: { code: row.code, from: before.status, to: row.status },
            },
            tx,
          );
        }
        return toSubject(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }
}
