import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type ActivityItem,
  type CreateStudent,
  normalizeRegistrationNumber,
  type StudentDetail,
  type StudentList,
  type StudentQuery,
  type UpdateStudent,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import { changedFields, rethrowAsFieldConflict } from '../common/conflicts.js';
import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { summarizeAudit } from './activity.js';
import {
  REGISTRATION_NUMBER_CONFLICT,
  RegistrationsService,
  registrationInclude,
  toRegistration,
} from './registrations.service.js';

const PERSONAL_FIELDS = ['fullName', 'fatherName', 'motherName', 'dateOfBirth', 'gender'] as const;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registrations: RegistrationsService,
  ) {}

  async list(query: StudentQuery): Promise<StudentList> {
    const registrationFilter: Prisma.StudentRegistrationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.programId ? { programId: query.programId } : {}),
      ...(query.academicSessionId ? { academicSessionId: query.academicSessionId } : {}),
    };
    const hasRegistrationFilter = Object.keys(registrationFilter).length > 0;
    const where: Prisma.StudentWhereInput = {
      AND: [
        hasRegistrationFilter ? { registrations: { some: registrationFilter } } : {},
        query.search
          ? {
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
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.student.findMany({
        where,
        include: {
          registrations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              program: { select: { id: true, code: true, name: true } },
              academicSession: { select: { id: true, code: true, name: true } },
            },
          },
          _count: { select: { registrations: true } },
        },
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.student.count({ where }),
    ]);
    return {
      data: rows.map((row) => {
        const latest = row.registrations[0];
        return {
          id: row.id,
          fullName: row.fullName,
          latestRegistration: latest
            ? {
                id: latest.id,
                registrationNumber: latest.registrationNumber,
                status: latest.status,
                program: latest.program,
                academicSession: latest.academicSession,
              }
            : null,
          registrationCount: row._count.registrations,
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      meta: paginationMeta(query, total),
    };
  }

  async get(id: string): Promise<StudentDetail> {
    const row = await this.prisma.client.student.findUnique({
      where: { id },
      include: { registrations: { orderBy: { createdAt: 'desc' }, include: registrationInclude } },
    });
    if (!row) throw Errors.notFound();
    return {
      id: row.id,
      fullName: row.fullName,
      fatherName: row.fatherName,
      motherName: row.motherName,
      dateOfBirth: toDateOnly(row.dateOfBirth),
      gender: row.gender,
      hasPhoto: row.photoStorageKey !== null,
      registrations: row.registrations.map(toRegistration),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Creates the student AND their first registration in ONE database transaction (with both audit
   * entries). If anything fails — invalid program, duplicate registration number, audit write — the
   * whole transaction rolls back and no orphan student is left behind.
   */
  async create(input: CreateStudent, actorUserId: string): Promise<StudentDetail> {
    try {
      const studentId = await this.prisma.client.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            fullName: input.student.fullName,
            fatherName: input.student.fatherName ?? null,
            motherName: input.student.motherName ?? null,
            dateOfBirth: fromDateOnly(input.student.dateOfBirth) ?? null,
            gender: input.student.gender ?? null,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.studentCreated,
            entityType: 'Student',
            entityId: student.id,
          },
          tx,
        );
        await this.registrations.createWithinTransaction(
          tx,
          student.id,
          input.registration,
          actorUserId,
        );
        return student.id;
      });
      return await this.get(studentId);
    } catch (error) {
      rethrowAsFieldConflict(error, REGISTRATION_NUMBER_CONFLICT);
    }
  }

  async update(id: string, input: UpdateStudent, actorUserId: string): Promise<StudentDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const before = await tx.student.findUnique({ where: { id } });
      if (!before) throw Errors.notFound();
      const after = await tx.student.update({
        where: { id },
        data: {
          fullName: input.fullName,
          fatherName: input.fatherName,
          motherName: input.motherName,
          dateOfBirth: fromDateOnly(input.dateOfBirth),
          gender: input.gender,
        },
      });
      const changed = changedFields(before, after, PERSONAL_FIELDS);
      if (changed.length > 0) {
        // Field NAMES only — personal values never go into the audit trail.
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.studentUpdated,
            entityType: 'Student',
            entityId: id,
            metadata: { changedFields: changed },
          },
          tx,
        );
      }
    });
    return this.get(id);
  }

  /** Audit activity for the student and all of their registrations, newest first. */
  async activity(id: string): Promise<ActivityItem[]> {
    const student = await this.prisma.client.student.findUnique({
      where: { id },
      select: { registrations: { select: { id: true } } },
    });
    if (!student) throw Errors.notFound();
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Student', entityId: id },
          {
            entityType: 'StudentRegistration',
            entityId: { in: student.registrations.map((r) => r.id) },
          },
        ],
      },
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(summarizeAudit);
  }
}
