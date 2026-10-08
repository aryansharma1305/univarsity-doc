import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type IssueActivationCodes,
  type IssuedActivationCodes,
  normalizeRegistrationNumber,
  type PortalState,
  type RevokeActivationCodes,
  type SetStudentAccountStatus,
  type StudentAccountList,
  type StudentAccountQuery,
  type StudentAccountRow,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { generateActivationCode, hashActivationCode } from '../student-auth/activation-codes.js';
import { StudentSessionStore } from '../student-auth/student-session.store.js';

/** Upper bound for "issue codes for every registration of an import". */
const MAX_CODES_PER_REQUEST = 2_000;
const DAY_MS = 86_400_000;

const rowInclude = {
  program: { select: { id: true, code: true, name: true } },
  academicSession: { select: { id: true, code: true, name: true } },
  student: { select: { id: true, fullName: true, account: true } },
  activationCodes: {
    where: { usedAt: null, revokedAt: null },
    select: { issuedAt: true, expiresAt: true },
  },
} as const;

type RegistrationRow = Prisma.StudentRegistrationGetPayload<{ include: typeof rowInclude }>;

function portalState(row: RegistrationRow, now: number): PortalState {
  const account = row.student.account;
  if (account) return account.status;
  const open = row.activationCodes[0];
  if (!open) return 'NO_ACCOUNT';
  return open.expiresAt.getTime() > now ? 'CODE_ISSUED' : 'CODE_EXPIRED';
}

/**
 * Staff administration of student portal accounts (Phase 6): which registrations can sign in,
 * activation-code issuance (shown once; only a hash is stored), revocation, and account status.
 */
@Injectable()
export class StudentAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: StudentSessionStore,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private stateFilter(state: PortalState, now: Date): Prisma.StudentRegistrationWhereInput {
    const open = { usedAt: null, revokedAt: null };
    switch (state) {
      case 'NO_ACCOUNT':
        return { student: { account: { is: null } }, activationCodes: { none: open } };
      case 'CODE_ISSUED':
        return {
          student: { account: { is: null } },
          activationCodes: { some: { ...open, expiresAt: { gt: now } } },
        };
      case 'CODE_EXPIRED':
        return {
          student: { account: { is: null } },
          activationCodes: { some: { ...open, expiresAt: { lte: now } } },
        };
      default:
        return { student: { account: { is: { status: state } } } };
    }
  }

  async list(query: StudentAccountQuery): Promise<StudentAccountList> {
    const now = new Date();
    const where: Prisma.StudentRegistrationWhereInput = {
      AND: [
        query.state ? this.stateFilter(query.state, now) : {},
        query.programId ? { programId: query.programId } : {},
        query.academicSessionId ? { academicSessionId: query.academicSessionId } : {},
        query.importJobId ? { importRows: { some: { importJobId: query.importJobId } } } : {},
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
        include: rowInclude,
        orderBy,
        ...pageArgs(query),
      }),
      this.prisma.client.studentRegistration.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toRow(row, now.getTime())),
      meta: paginationMeta(query, total),
    };
  }

  private toRow(row: RegistrationRow, now: number): StudentAccountRow {
    const account = row.student.account;
    const open = row.activationCodes[0];
    return {
      registrationId: row.id,
      registrationNumber: row.registrationNumber,
      studentId: row.student.id,
      studentName: row.student.fullName,
      program: row.program,
      academicSession: row.academicSession,
      registrationStatus: row.status,
      state: portalState(row, now),
      account: account
        ? {
            id: account.id,
            status: account.status,
            statusReason: account.statusReason,
            activatedAt: account.activatedAt.toISOString(),
            lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
          }
        : null,
      openCode: open
        ? { issuedAt: open.issuedAt.toISOString(), expiresAt: open.expiresAt.toISOString() }
        : null,
    };
  }

  /**
   * Issues a NEW single-use code per registration (any previous open code is revoked). For a student
   * who already has an account the code works as a recovery code (it sets a new password). Skipped:
   * revoked registrations and disabled accounts. The plain codes are returned once and never stored.
   */
  async issueCodes(
    input: IssueActivationCodes,
    actorUserId: string,
  ): Promise<IssuedActivationCodes> {
    const ids = input.registrationIds
      ? [...new Set(input.registrationIds)]
      : (
          await this.prisma.client.importRow.findMany({
            where: {
              importJobId: input.importJobId ?? '',
              registrationId: { not: null },
              status: { not: 'ERROR' },
            },
            select: { registrationId: true },
            distinct: ['registrationId'],
            take: MAX_CODES_PER_REQUEST + 1,
          })
        ).flatMap((row) => (row.registrationId ? [row.registrationId] : []));
    if (ids.length > MAX_CODES_PER_REQUEST) {
      throw Errors.validation([
        {
          path: 'importJobId',
          message: `At most ${MAX_CODES_PER_REQUEST} codes can be issued at once. Filter the list and issue in parts.`,
        },
      ]);
    }
    const registrations = await this.prisma.client.studentRegistration.findMany({
      where: { id: { in: ids } },
      include: {
        program: { select: { code: true } },
        student: { select: { fullName: true, account: { select: { status: true } } } },
      },
      orderBy: { registrationNumberNormalized: 'asc' },
    });
    if (input.registrationIds && registrations.length !== ids.length) throw Errors.notFound();

    const result: IssuedActivationCodes = { issued: [], skipped: [] };
    const expiresAt = new Date(Date.now() + this.config.STUDENT_ACTIVATION_CODE_TTL_DAYS * DAY_MS);
    const eligible = registrations.filter((registration) => {
      const reason =
        registration.status === 'REVOKED'
          ? 'The registration is revoked.'
          : registration.student.account?.status === 'DISABLED'
            ? 'The student account is disabled.'
            : null;
      if (reason)
        result.skipped.push({
          registrationId: registration.id,
          registrationNumber: registration.registrationNumber,
          reason,
        });
      return reason === null;
    });

    await this.prisma.client.$transaction(
      async (tx) => {
        const now = new Date();
        await tx.studentActivationCode.updateMany({
          where: {
            studentRegistrationId: { in: eligible.map((r) => r.id) },
            usedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        for (const registration of eligible) {
          const { code, formatted } = generateActivationCode();
          await tx.studentActivationCode.create({
            data: {
              studentRegistrationId: registration.id,
              codeHash: hashActivationCode(this.config.SESSION_SECRET, code),
              issuedByUserId: actorUserId,
              issuedAt: now,
              expiresAt,
            },
          });
          await this.audit.writeAuditEvent(
            {
              actorUserId,
              action: AUDIT_ACTIONS.studentActivationCodeIssued,
              entityType: 'StudentRegistration',
              entityId: registration.id,
              metadata: {
                registrationNumber: registration.registrationNumber,
                expiresAt: expiresAt.toISOString(),
                recovery: registration.student.account !== null,
              },
            },
            tx,
          );
          result.issued.push({
            registrationId: registration.id,
            registrationNumber: registration.registrationNumber,
            studentName: registration.student.fullName,
            programCode: registration.program.code,
            code: formatted,
            expiresAt: expiresAt.toISOString(),
          });
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    return result;
  }

  async revokeCodes(
    input: RevokeActivationCodes,
    actorUserId: string,
  ): Promise<{ revoked: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const open = await tx.studentActivationCode.findMany({
        where: {
          studentRegistrationId: { in: input.registrationIds },
          usedAt: null,
          revokedAt: null,
        },
        select: { id: true, studentRegistrationId: true },
      });
      await tx.studentActivationCode.updateMany({
        where: { id: { in: open.map((code) => code.id) } },
        data: { revokedAt: new Date() },
      });
      for (const code of open) {
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.studentActivationCodeRevoked,
            entityType: 'StudentRegistration',
            entityId: code.studentRegistrationId,
          },
          tx,
        );
      }
      return { revoked: open.length };
    });
  }

  /** Locks, disables or re-activates an account. Any status other than ACTIVE ends all its sessions. */
  async setStatus(
    accountId: string,
    input: SetStudentAccountStatus,
    actorUserId: string,
  ): Promise<StudentAccountRow> {
    const before = await this.prisma.client.studentAccount.findUnique({ where: { id: accountId } });
    if (!before) throw Errors.notFound();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.studentAccount.update({
        where: { id: accountId },
        data: {
          status: input.status,
          statusReason: input.status === 'ACTIVE' ? null : input.reason,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.studentAccountStatusChanged,
          entityType: 'StudentAccount',
          entityId: accountId,
          metadata: { from: before.status, to: input.status, reason: input.reason },
        },
        tx,
      );
    });
    if (input.status !== 'ACTIVE') await this.sessions.revokeAllForUser(accountId);
    const registration = await this.prisma.client.studentRegistration.findFirstOrThrow({
      where: { studentId: before.studentId },
      include: rowInclude,
      orderBy: { createdAt: 'desc' },
    });
    return this.toRow(registration, Date.now());
  }
}
