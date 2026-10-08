import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import type {
  CreateProgram,
  Program,
  ProgramList,
  ProgramQuery,
  UpdateProgram,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import { changedFields, invalidRelation, rethrowAsFieldConflict } from '../common/conflicts.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';

const CODE_CONFLICT = {
  programs_code_key: { path: 'code', message: 'A program with this code already exists.' },
};

const include = {
  department: { select: { id: true, code: true, name: true } },
  _count: { select: { registrations: true } },
} as const;

type ProgramRow = Prisma.ProgramGetPayload<{ include: typeof include }>;

function toProgram(row: ProgramRow): Program {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    level: row.level,
    durationSemesters: row.durationSemesters,
    department: row.department,
    status: row.status,
    registrationCount: row._count.registrations,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProgramQuery): Promise<ProgramList> {
    const where: Prisma.ProgramWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
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
      this.prisma.client.program.findMany({
        where,
        include,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.program.count({ where }),
    ]);
    return { data: rows.map(toProgram), meta: paginationMeta(query, total) };
  }

  async get(id: string): Promise<Program> {
    const row = await this.prisma.client.program.findUnique({ where: { id }, include });
    if (!row) throw Errors.notFound();
    return toProgram(row);
  }

  async create(input: CreateProgram, actorUserId: string): Promise<Program> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        if (input.departmentId) await assertActiveDepartment(tx, input.departmentId);
        const row = await tx.program.create({
          data: {
            code: input.code,
            name: input.name,
            level: input.level ?? null,
            durationSemesters: input.durationSemesters ?? null,
            departmentId: input.departmentId ?? null,
            status: input.status,
          },
          include,
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.programCreated,
            entityType: 'Program',
            entityId: row.id,
            metadata: { code: row.code, status: row.status },
          },
          tx,
        );
        return toProgram(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }

  async update(id: string, input: UpdateProgram, actorUserId: string): Promise<Program> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const before = await tx.program.findUnique({ where: { id } });
        if (!before) throw Errors.notFound();
        if (input.departmentId && input.departmentId !== before.departmentId) {
          await assertActiveDepartment(tx, input.departmentId);
        }
        const row = await tx.program.update({ where: { id }, data: input, include });
        const changed = changedFields(before, row, [
          'code',
          'name',
          'level',
          'durationSemesters',
          'departmentId',
        ]);
        if (changed.length > 0) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.programUpdated,
              entityType: 'Program',
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
              action: AUDIT_ACTIONS.programStatusChanged,
              entityType: 'Program',
              entityId: id,
              metadata: { code: row.code, from: before.status, to: row.status },
            },
            tx,
          );
        }
        return toProgram(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }
}

async function assertActiveDepartment(
  tx: Prisma.TransactionClient,
  departmentId: string,
): Promise<void> {
  const department = await tx.department.findUnique({ where: { id: departmentId } });
  if (!department) throw invalidRelation('departmentId', 'Choose an existing department.');
  if (department.status !== 'ACTIVE') {
    throw invalidRelation(
      'departmentId',
      'This department is inactive. Choose an active department.',
    );
  }
}
