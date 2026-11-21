import { randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type DatabaseModels } from '@docversity/database';
import { AUDIT_ACTIONS, PERMISSIONS } from '@docversity/types';
import {
  ERROR_CODES,
  type PublicVerificationQueryInput,
  type PublicVerificationQueryReceipt,
  type PublicVerificationQueryStatusRequest,
  type RequesterVerificationQuery,
  type RequesterVerificationQueryList,
  type RespondVerificationQuery,
  type StaffVerificationQuery,
  type StaffVerificationQueryList,
  type StudentVerificationQueryInput,
  type VerificationQueryListQuery,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

const ENTITY = 'VerificationQuery';
/** Crockford base32 (no I, L, O, U): unambiguous when read aloud or typed. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const randomCode = (length: number) =>
  Array.from(randomBytes(length), (byte) => ALPHABET[byte % 32]).join('');
const ACCESS_PURPOSE = 'verification-query-access';
const NOT_FOUND = () =>
  new AppError(
    HttpStatus.NOT_FOUND,
    'NOT_FOUND',
    'No query matches this reference and access code.',
  );
const conflict = () =>
  new AppError(HttpStatus.CONFLICT, 'CONFLICT', 'This query changed. Refresh before trying again.');

type Row = DatabaseModels.VerificationQueryModel & {
  student?: { id: string; fullName: string } | null;
};

const requester = (row: Row): RequesterVerificationQuery => ({
  id: row.id,
  reference: row.reference,
  status: row.status,
  category: row.category,
  documentReference: row.documentReference,
  message: row.message,
  response: row.response,
  respondedAt: row.respondedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const staff = (row: Row): StaffVerificationQuery => ({
  ...requester(row),
  source: row.source,
  requesterName: row.requesterName,
  organization: row.organization,
  contactEmail: row.contactEmail,
  student: row.student ? { id: row.student.id, fullName: row.student.fullName } : null,
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  version: row.version,
});

/**
 * Verification support queries from students (session) and external verifiers (public form).
 * Nothing here looks up or discloses academic records: staff answers are free text shown only to
 * the requester — the student, or whoever holds the reference and the one-time access code.
 */
@Injectable()
export class VerificationQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
  ) {}

  private async throttle(scope: string, principal: string, limit: number, windowSeconds: number) {
    const result = await this.limiter.hit(
      scope,
      [{ key: this.hasher.hash(scope, principal), limit }],
      windowSeconds,
    );
    if (result.limited)
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.authRateLimited,
        'Too many requests. Please wait before trying again.',
        { headers: { 'Retry-After': String(Math.max(1, result.retryAfterSeconds)) } },
      );
  }

  /** Creates the row with a fresh reference (retried on the rare unique collision). */
  private async insert(
    data: Omit<Prisma.VerificationQueryUncheckedCreateInput, 'reference'>,
    audit: { actorUserId: null; metadata: Record<string, unknown> },
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.client.$transaction(async (tx) => {
          const row = await tx.verificationQuery.create({
            data: { ...data, reference: `VQ-${randomCode(8)}` },
          });
          await this.audit.writeAuditEvent(
            {
              actorUserId: audit.actorUserId,
              action: AUDIT_ACTIONS.verificationQuerySubmitted,
              entityType: ENTITY,
              entityId: row.id,
              metadata: { source: row.source, category: row.category, ...audit.metadata },
            },
            tx,
          );
          await this.notifications.notifyStaff(tx, PERMISSIONS.verificationQueriesRead, {
            type: 'VERIFICATION_QUERY_RECEIVED',
            title: 'New verification query',
            body: `A ${row.source === 'PUBLIC' ? 'public' : 'student'} verification query was submitted.`,
            link: `/admin/verification-queries/${row.id}`,
            event: `verification-query:${row.id}`,
          });
          return row;
        });
      } catch (error) {
        const duplicate =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!duplicate || attempt >= 3) throw error;
      }
    }
  }

  async submitAsStudent(
    studentId: string,
    accountId: string,
    body: StudentVerificationQueryInput,
  ): Promise<RequesterVerificationQuery> {
    await this.throttle('verification-query-submit', accountId, 10, 3600);
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      select: { fullName: true },
    });
    if (!student) throw Errors.notFound();
    const row = await this.insert(
      {
        source: 'STUDENT',
        studentId,
        requesterName: student.fullName,
        category: body.category,
        documentReference: body.documentReference ?? null,
        message: body.message,
      },
      { actorUserId: null, metadata: { studentId, accountId } },
    );
    return requester(row);
  }

  async listOwn(studentId: string): Promise<RequesterVerificationQueryList> {
    const rows = await this.prisma.client.verificationQuery.findMany({
      where: { studentId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return { data: rows.map(requester) };
  }

  /** Public submission: the access code is returned once and stored only as an HMAC. */
  async submitPublic(
    body: PublicVerificationQueryInput,
    ip: string,
  ): Promise<PublicVerificationQueryReceipt> {
    await this.throttle('verification-query-public', ip, 5, 3600);
    const accessCode = randomCode(24);
    const row = await this.insert(
      {
        source: 'PUBLIC',
        requesterName: body.requesterName,
        organization: body.organization ?? null,
        contactEmail: body.contactEmail ?? null,
        category: body.category,
        documentReference: body.documentReference ?? null,
        message: body.message,
        accessCodeHash: this.hasher.hash(ACCESS_PURPOSE, accessCode),
      },
      {
        actorUserId: null,
        metadata: { clientHash: this.hasher.hash('verification-query:client', ip) },
      },
    );
    return { reference: row.reference, accessCode, status: row.status };
  }

  /** Reference + access code → the requester's own query and answer. One answer for every miss. */
  async publicStatus(
    body: PublicVerificationQueryStatusRequest,
    ip: string,
  ): Promise<RequesterVerificationQuery> {
    await this.throttle('verification-query-status', ip, 30, 3600);
    await this.throttle('verification-query-status-ref', body.reference, 10, 3600);
    const row = await this.prisma.client.verificationQuery.findUnique({
      where: { reference: body.reference },
    });
    const expected = Buffer.from(row?.accessCodeHash ?? '0'.repeat(64), 'hex');
    const given = Buffer.from(
      this.hasher.hash(ACCESS_PURPOSE, body.accessCode.toUpperCase()),
      'hex',
    );
    const match = expected.length === given.length && timingSafeEqual(expected, given);
    if (row?.source !== 'PUBLIC' || !match) throw NOT_FOUND();
    return requester(row);
  }

  async list(query: VerificationQueryListQuery): Promise<StaffVerificationQueryList> {
    const where: Prisma.VerificationQueryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search.toUpperCase() } },
              { requesterName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.verificationQuery.count({ where }),
      this.prisma.client.verificationQuery.findMany({
        where,
        include: { student: { select: { id: true, fullName: true } } },
        orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map(staff),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async detail(id: string): Promise<StaffVerificationQuery> {
    const row = await this.prisma.client.verificationQuery.findUnique({
      where: { id },
      include: { student: { select: { id: true, fullName: true } } },
    });
    if (!row) throw Errors.notFound();
    return staff(row);
  }

  async respond(id: string, body: RespondVerificationQuery, userId: string) {
    await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.verificationQuery.updateMany({
        where: { id, version: body.version, status: { not: 'RESOLVED' } },
        data: {
          response: body.response,
          respondedByUserId: userId,
          respondedAt: now,
          status: body.resolve ? 'RESOLVED' : 'ANSWERED',
          ...(body.resolve ? { resolvedAt: now, resolvedByUserId: userId } : {}),
          version: { increment: 1 },
        },
      });
      const row = await tx.verificationQuery.findUnique({ where: { id } });
      if (!row) throw Errors.notFound();
      if (changed.count !== 1) throw conflict();
      await this.audit.writeAuditEvent(
        {
          actorUserId: userId,
          action: AUDIT_ACTIONS.verificationQueryAnswered,
          entityType: ENTITY,
          entityId: id,
          metadata: { status: row.status, version: row.version },
        },
        tx,
      );
      if (row.studentId)
        await this.notifications.notifyStudent(tx, row.studentId, {
          type: 'VERIFICATION_QUERY_ANSWERED',
          title: 'Your verification query was answered',
          body: `The university answered query ${row.reference}.`,
          link: '/student/verification-queries',
          event: `verification-query:${id}:v${String(row.version)}`,
        });
    });
    return this.detail(id);
  }

  async resolve(id: string, version: number, userId: string) {
    await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.verificationQuery.updateMany({
        where: { id, version, status: 'ANSWERED' },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedByUserId: userId,
          version: { increment: 1 },
        },
      });
      if (!(await tx.verificationQuery.findUnique({ where: { id }, select: { id: true } })))
        throw Errors.notFound();
      if (changed.count !== 1)
        throw new AppError(
          HttpStatus.CONFLICT,
          'CONFLICT',
          'Only an answered, unchanged query can be resolved.',
        );
      await this.audit.writeAuditEvent(
        {
          actorUserId: userId,
          action: AUDIT_ACTIONS.verificationQueryResolved,
          entityType: ENTITY,
          entityId: id,
          metadata: { version: version + 1 },
        },
        tx,
      );
    });
    return this.detail(id);
  }
}
