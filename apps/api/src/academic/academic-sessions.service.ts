import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ACADEMIC_SESSION_DATE_ORDER_MESSAGE,
  type AcademicSession,
  type AcademicSessionList,
  type AcademicSessionQuery,
  type CreateAcademicSession,
  datesInOrder,
  type UpdateAcademicSession,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import { changedFields, invalidRelation, rethrowAsFieldConflict } from '../common/conflicts.js';
import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';

const CODE_CONFLICT = {
  academic_sessions_code_key: {
    path: 'code',
    message: 'An academic session with this code already exists.',
  },
};

const include = { _count: { select: { registrations: true } } } as const;
type SessionRow = Prisma.AcademicSessionGetPayload<{ include: typeof include }>;

function toSession(row: SessionRow): AcademicSession {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    startsOn: toDateOnly(row.startsOn),
    endsOn: toDateOnly(row.endsOn),
    status: row.status,
    registrationCount: row._count.registrations,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class AcademicSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AcademicSessionQuery): Promise<AcademicSessionList> {
    const where: Prisma.AcademicSessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
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
      this.prisma.client.academicSession.findMany({
        where,
        include,
        orderBy: [{ [query.sortBy]: { sort: query.sortOrder, nulls: 'last' } }, { code: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.academicSession.count({ where }),
    ]);
    return { data: rows.map(toSession), meta: paginationMeta(query, total) };
  }

  async get(id: string): Promise<AcademicSession> {
    const row = await this.prisma.client.academicSession.findUnique({ where: { id }, include });
    if (!row) throw Errors.notFound();
    return toSession(row);
  }

  async create(input: CreateAcademicSession, actorUserId: string): Promise<AcademicSession> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const row = await tx.academicSession.create({
          data: {
            code: input.code,
            name: input.name,
            startsOn: fromDateOnly(input.startsOn) ?? null,
            endsOn: fromDateOnly(input.endsOn) ?? null,
            status: input.status,
          },
          include,
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.academicSessionCreated,
            entityType: 'AcademicSession',
            entityId: row.id,
            metadata: { code: row.code, status: row.status },
          },
          tx,
        );
        return toSession(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }

  async update(
    id: string,
    input: UpdateAcademicSession,
    actorUserId: string,
  ): Promise<AcademicSession> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const before = await tx.academicSession.findUnique({ where: { id } });
        if (!before) throw Errors.notFound();
        // Check the date order against the values that will be stored, not just the request.
        const startsOn =
          input.startsOn !== undefined ? input.startsOn : toDateOnly(before.startsOn);
        const endsOn = input.endsOn !== undefined ? input.endsOn : toDateOnly(before.endsOn);
        if (!datesInOrder(startsOn, endsOn))
          throw invalidRelation('endsOn', ACADEMIC_SESSION_DATE_ORDER_MESSAGE);

        const row = await tx.academicSession.update({
          where: { id },
          data: {
            code: input.code,
            name: input.name,
            startsOn: fromDateOnly(input.startsOn),
            endsOn: fromDateOnly(input.endsOn),
            status: input.status,
          },
          include,
        });
        const changed = changedFields(before, row, ['code', 'name', 'startsOn', 'endsOn']);
        if (changed.length > 0) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.academicSessionUpdated,
              entityType: 'AcademicSession',
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
              action: AUDIT_ACTIONS.academicSessionStatusChanged,
              entityType: 'AcademicSession',
              entityId: id,
              metadata: { code: row.code, from: before.status, to: row.status },
            },
            tx,
          );
        }
        return toSession(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, CODE_CONFLICT);
    }
  }
}
