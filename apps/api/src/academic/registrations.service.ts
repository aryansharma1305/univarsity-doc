import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type CreateRegistration,
  type NewRegistration,
  normalizeRegistrationNumber,
  type Registration,
  registrationDatesInOrder,
  type RegistrationList,
  type RegistrationQuery,
  type UpdateRegistration,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import { changedFields, invalidRelation, rethrowAsFieldConflict } from '../common/conflicts.js';
import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { resolveRegistrationRelations } from './registration-relations.js';

export const REGISTRATION_NUMBER_CONFLICT = {
  student_registrations_registration_number_normalized_key: {
    path: 'registrationNumber',
    message:
      'This registration number is already in use (registration numbers are not case-sensitive).',
  },
};

export const registrationInclude = {
  student: { select: { id: true, fullName: true } },
  program: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
  academicSession: { select: { id: true, code: true, name: true } },
} as const;

export type RegistrationRow = Prisma.StudentRegistrationGetPayload<{
  include: typeof registrationInclude;
}>;

export function toRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    studentId: row.student.id,
    studentName: row.student.fullName,
    registrationNumber: row.registrationNumber,
    rollReferenceNumber: row.rollReferenceNumber,
    program: row.program,
    department: row.department,
    academicSession: row.academicSession,
    admissionDate: toDateOnly(row.admissionDate),
    completionDate: toDateOnly(row.completionDate),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const COMPLETION_MESSAGE = 'The completion date must be on or after the admission date.';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: RegistrationQuery): Promise<RegistrationList> {
    const where: Prisma.StudentRegistrationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.programId ? { programId: query.programId } : {}),
      ...(query.academicSessionId ? { academicSessionId: query.academicSessionId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                registrationNumberNormalized: {
                  contains: normalizeRegistrationNumber(query.search),
                },
              },
              { rollReferenceNumber: { contains: query.search, mode: 'insensitive' } },
              { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const sortField =
      query.sortBy === 'registrationNumber' ? 'registrationNumberNormalized' : query.sortBy;
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.studentRegistration.findMany({
        where,
        include: registrationInclude,
        orderBy: [{ [sortField]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.studentRegistration.count({ where }),
    ]);
    return { data: rows.map(toRegistration), meta: paginationMeta(query, total) };
  }

  async get(id: string): Promise<Registration> {
    const row = await this.prisma.client.studentRegistration.findUnique({
      where: { id },
      include: registrationInclude,
    });
    if (!row) throw Errors.notFound();
    return toRegistration(row);
  }

  async create(input: CreateRegistration, actorUserId: string): Promise<Registration> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const student = await tx.student.findUnique({ where: { id: input.studentId } });
        if (!student) throw invalidRelation('studentId', 'Choose an existing student.');
        const { studentId, ...registration } = input;
        const row = await this.createWithinTransaction(tx, studentId, registration, actorUserId);
        return toRegistration(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, REGISTRATION_NUMBER_CONFLICT);
    }
  }

  /** Shared by POST /registrations and the student+registration create flow (same transaction). */
  async createWithinTransaction(
    tx: Prisma.TransactionClient,
    studentId: string,
    input: NewRegistration,
    actorUserId: string,
  ): Promise<RegistrationRow> {
    const relations = await resolveRegistrationRelations(
      tx,
      {
        programId: input.programId,
        academicSessionId: input.academicSessionId,
        departmentId: input.departmentId,
      },
      { program: true, session: true, department: true },
    );
    const row = await tx.studentRegistration.create({
      data: {
        studentId,
        registrationNumber: input.registrationNumber,
        registrationNumberNormalized: normalizeRegistrationNumber(input.registrationNumber),
        rollReferenceNumber: input.rollReferenceNumber ?? null,
        ...relations,
        admissionDate: fromDateOnly(input.admissionDate) ?? null,
        completionDate: fromDateOnly(input.completionDate) ?? null,
        status: input.status,
      },
      include: registrationInclude,
    });
    await this.audit.writeAuditEvent(
      {
        actorUserId,
        action: AUDIT_ACTIONS.registrationCreated,
        entityType: 'StudentRegistration',
        entityId: row.id,
        metadata: { studentId, registrationNumber: row.registrationNumber, status: row.status },
      },
      tx,
    );
    return row;
  }

  async update(id: string, input: UpdateRegistration, actorUserId: string): Promise<Registration> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const before = await tx.studentRegistration.findUnique({ where: { id } });
        if (!before) throw Errors.notFound();

        const admissionDate =
          input.admissionDate !== undefined
            ? input.admissionDate
            : toDateOnly(before.admissionDate);
        const completionDate =
          input.completionDate !== undefined
            ? input.completionDate
            : toDateOnly(before.completionDate);
        if (!registrationDatesInOrder(admissionDate, completionDate)) {
          throw invalidRelation('completionDate', COMPLETION_MESSAGE);
        }

        const programChanged =
          input.programId !== undefined && input.programId !== before.programId;
        const sessionChanged =
          input.academicSessionId !== undefined &&
          input.academicSessionId !== before.academicSessionId;
        const departmentChanged =
          input.departmentId !== undefined && input.departmentId !== before.departmentId;
        const relations = await resolveRegistrationRelations(
          tx,
          {
            programId: input.programId ?? before.programId,
            academicSessionId: input.academicSessionId ?? before.academicSessionId,
            // Keep the stored department unless the client changes it or the program changes.
            departmentId:
              input.departmentId !== undefined
                ? input.departmentId
                : programChanged
                  ? undefined
                  : before.departmentId,
          },
          { program: programChanged, session: sessionChanged, department: departmentChanged },
        );

        const row = await tx.studentRegistration.update({
          where: { id },
          data: {
            ...(input.registrationNumber !== undefined
              ? {
                  registrationNumber: input.registrationNumber,
                  registrationNumberNormalized: normalizeRegistrationNumber(
                    input.registrationNumber,
                  ),
                }
              : {}),
            rollReferenceNumber: input.rollReferenceNumber,
            ...relations,
            admissionDate: fromDateOnly(input.admissionDate),
            completionDate: fromDateOnly(input.completionDate),
            status: input.status,
          },
          include: registrationInclude,
        });

        const changed = changedFields(before, row, [
          'registrationNumber',
          'rollReferenceNumber',
          'programId',
          'departmentId',
          'academicSessionId',
          'admissionDate',
          'completionDate',
        ]);
        if (changed.length > 0) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.registrationUpdated,
              entityType: 'StudentRegistration',
              entityId: id,
              metadata: {
                studentId: row.studentId,
                registrationNumber: row.registrationNumber,
                changedFields: changed,
              },
            },
            tx,
          );
        }
        if (before.status !== row.status) {
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.registrationStatusChanged,
              entityType: 'StudentRegistration',
              entityId: id,
              metadata: {
                studentId: row.studentId,
                registrationNumber: row.registrationNumber,
                from: before.status,
                to: row.status,
              },
            },
            tx,
          );
        }
        return toRegistration(row);
      });
    } catch (error) {
      rethrowAsFieldConflict(error, REGISTRATION_NUMBER_CONFLICT);
    }
  }
}
