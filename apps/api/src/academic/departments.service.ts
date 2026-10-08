import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import type {
  CreateDepartment,
  Department,
  DepartmentList,
  DepartmentQuery,
  UpdateDepartment,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import { changedFields, rethrowAsFieldConflict } from '../common/conflicts.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';

const CODE_CONFLICT = {
  departments_code_key: { path: 'code', message: 'A department with this code already exists.' },
};

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  _count: { programs: number };
}

function toDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    programCount: row._count.programs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const include = { _count: { select: { programs: true } } } as const;

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: DepartmentQuery): Promise<DepartmentList> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.department.findMany({
        where,
        include,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.department.count({ where }),
    ]);
    return { data: rows.map(toDepartment), meta: paginationMeta(query, total) };
  }

  async get(id: string): Promise<Department> {
    const row = await this.prisma.client.department.findUnique({ where: { id }, include });
    if (!row) throw Errors.notFound();
    return toDepartment(row);
  }

  async create(input: CreateDepartment, actorUserId: string): Promise<Department> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const row = await tx.department.create({ data: input, include });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.departmentCreated,
            entityType: 'Department',
            entityId: row.id,
            metadata: { code: row.code, status: row.status },
          },
          tx,
        );
        return toDepartment(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }

  async update(id: string, input: UpdateDepartment, actorUserId: string): Promise<Department> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const before = await tx.department.findUnique({ where: { id } });
        if (!before) throw Errors.notFound();
        const row = await tx.department.update({ where: { id }, data: input, include });
        const changed = changedFields(before, row, ['code', 'name']);
        if (changed.length > 0) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.departmentUpdated,
              entityType: 'Department',
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
              action: AUDIT_ACTIONS.departmentStatusChanged,
              entityType: 'Department',
              entityId: id,
              metadata: { code: row.code, from: before.status, to: row.status },
            },
            tx,
          );
        }
        return toDepartment(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }
}
