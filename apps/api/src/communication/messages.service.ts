import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS, PERMISSIONS } from '@docversity/types';
import {
  ERROR_CODES,
  type CreateMessageThread,
  type MessageReply,
  type MessageThreadDetail,
  type MessageThreadList,
  type MessageThreadQuery,
  type MessageThreadSummary,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

const ENTITY = 'MessageThread';
/** Students see replies from the institution, never individual staff names. */
const ADMINISTRATION = 'University administration';

type Viewer = 'student' | 'staff';
const THREAD_INCLUDE = {
  student: {
    select: {
      id: true,
      fullName: true,
      registrations: {
        select: { registrationNumber: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  },
} satisfies Prisma.MessageThreadInclude;
type ThreadRow = Prisma.MessageThreadGetPayload<{ include: typeof THREAD_INCLUDE }>;

function summary(row: ThreadRow, viewer: Viewer): MessageThreadSummary {
  const read = viewer === 'student' ? row.studentReadAt : row.staffReadAt;
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    unread: !read || row.lastMessageAt > read,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    ...(viewer === 'staff'
      ? {
          student: {
            id: row.student.id,
            fullName: row.student.fullName,
            registrationNumber: row.student.registrations[0]?.registrationNumber ?? null,
          },
        }
      : {}),
  };
}

/**
 * Student messages: a student's private conversations with the administration. The student always
 * comes from the session; staff need `studentMessages.read` / `.respond`. Messages are append-only;
 * audit metadata holds IDs and the author kind only, never message text.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
  ) {}

  private async throttle(principal: string) {
    const result = await this.limiter.hit(
      'messages-write',
      [{ key: this.hasher.hash('messages-write', principal), limit: 30 }],
      3600,
    );
    if (result.limited)
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.authRateLimited,
        'Too many messages. Please wait before sending another.',
        { headers: { 'Retry-After': String(Math.max(1, result.retryAfterSeconds)) } },
      );
  }

  async list(
    query: MessageThreadQuery,
    viewer: Viewer,
    studentId?: string,
  ): Promise<MessageThreadList> {
    const where: Prisma.MessageThreadWhereInput = {
      ...(studentId ? { studentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search && viewer === 'staff'
        ? {
            OR: [
              { subject: { contains: query.search, mode: 'insensitive' } },
              { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    // Unread = newer than the viewer's read marker, compared in SQL (column reference).
    if (query.unread === 'true') {
      const fields = this.prisma.client.messageThread.fields;
      const marker = viewer === 'student' ? 'studentReadAt' : 'staffReadAt';
      where.AND = [{ OR: [{ [marker]: null }, { lastMessageAt: { gt: fields[marker] } }] }];
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.messageThread.count({ where }),
      this.prisma.client.messageThread.findMany({
        where,
        include: THREAD_INCLUDE,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'desc' }],
        take: query.pageSize,
        skip: (query.page - 1) * query.pageSize,
      }),
    ]);
    const data = rows.map((row) => summary(row, viewer));
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** Opens a thread and marks it read for the viewer. A student only ever sees their own. */
  async detail(id: string, viewer: Viewer, studentId?: string): Promise<MessageThreadDetail> {
    const row = await this.prisma.client.messageThread.findFirst({
      where: { id, ...(studentId ? { studentId } : {}) },
      include: {
        ...THREAD_INCLUDE,
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { authorUser: { select: { displayName: true } } },
        },
      },
    });
    if (!row) throw Errors.notFound();
    return {
      ...summary(row, viewer),
      messages: row.messages.map((m) => ({
        id: m.id,
        author: m.author,
        authorName:
          m.author === 'STUDENT'
            ? row.student.fullName
            : viewer === 'staff'
              ? (m.authorUser?.displayName ?? 'Staff')
              : ADMINISTRATION,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  /** Marks a thread read for the viewer (explicit POST; GET never changes state). */
  async markRead(id: string, viewer: Viewer, studentId?: string) {
    const changed = await this.prisma.client.messageThread.updateMany({
      where: { id, ...(studentId ? { studentId } : {}) },
      data: viewer === 'student' ? { studentReadAt: new Date() } : { staffReadAt: new Date() },
    });
    if (changed.count !== 1) throw Errors.notFound();
    return this.detail(id, viewer, studentId);
  }

  async create(studentId: string, accountId: string, body: CreateMessageThread) {
    await this.throttle(accountId);
    const id = await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const thread = await tx.messageThread.create({
        data: {
          studentId,
          subject: body.subject,
          lastMessageAt: now,
          studentReadAt: now,
          messages: { create: { author: 'STUDENT', body: body.body, createdAt: now } },
        },
        include: { messages: { select: { id: true } } },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: null,
          action: AUDIT_ACTIONS.messageThreadCreated,
          entityType: ENTITY,
          entityId: thread.id,
          metadata: { studentId, accountId, messageId: thread.messages[0]?.id },
        },
        tx,
      );
      await this.notifications.notifyStaff(tx, PERMISSIONS.studentMessagesRead, {
        type: 'MESSAGE_RECEIVED',
        title: 'New student message',
        body: 'A student started a new conversation.',
        link: `/admin/messages/${thread.id}`,
        event: `message:${thread.messages[0]?.id ?? thread.id}`,
      });
      return thread.id;
    });
    return this.detail(id, 'student', studentId);
  }

  /** Appends a message. A student reply reopens a resolved conversation. */
  async reply(
    id: string,
    body: MessageReply,
    actor: { studentId: string; accountId: string } | { userId: string },
  ): Promise<MessageThreadDetail> {
    const student = 'studentId' in actor;
    await this.throttle(student ? actor.accountId : actor.userId);
    const thread = await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM message_threads WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.messageThread.findFirst({
        where: { id, ...(student ? { studentId: actor.studentId } : {}) },
      });
      if (!row) throw Errors.notFound();
      if (!student && row.status === 'RESOLVED')
        throw new AppError(
          HttpStatus.CONFLICT,
          'CONFLICT',
          'Reopen this conversation before replying.',
        );
      const now = new Date();
      const message = await tx.threadMessage.create({
        data: {
          threadId: id,
          author: student ? 'STUDENT' : 'STAFF',
          authorUserId: student ? null : actor.userId,
          body: body.body,
          createdAt: now,
        },
      });
      await tx.messageThread.update({
        where: { id },
        data: {
          lastMessageAt: now,
          ...(student
            ? { studentReadAt: now, status: 'OPEN', resolvedAt: null, resolvedByUserId: null }
            : { staffReadAt: now }),
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: student ? null : actor.userId,
          action: AUDIT_ACTIONS.messageSent,
          entityType: ENTITY,
          entityId: id,
          metadata: {
            messageId: message.id,
            author: student ? 'STUDENT' : 'STAFF',
            ...(student ? { accountId: actor.accountId } : {}),
            ...(student && row.status === 'RESOLVED' ? { reopened: true } : {}),
          },
        },
        tx,
      );
      const event = `message:${message.id}`;
      if (student)
        await this.notifications.notifyStaff(tx, PERMISSIONS.studentMessagesRead, {
          type: 'MESSAGE_RECEIVED',
          title: 'New student message',
          body: 'A student replied in a conversation.',
          link: `/admin/messages/${id}`,
          event,
          collapse: true,
        });
      else
        await this.notifications.notifyStudent(tx, row.studentId, {
          type: 'MESSAGE_REPLY',
          title: 'New reply from the university',
          body: 'The administration replied to your message.',
          link: `/student/messages/${id}`,
          event,
          collapse: true,
        });
      return row;
    });
    return this.detail(id, student ? 'student' : 'staff', student ? thread.studentId : undefined);
  }

  async setStatus(id: string, status: 'OPEN' | 'RESOLVED', userId: string) {
    await this.prisma.client.$transaction(async (tx) => {
      const fields = tx.messageThread.fields;
      const changed = await tx.messageThread.updateMany({
        where: {
          id,
          status: status === 'RESOLVED' ? 'OPEN' : 'RESOLVED',
          // Never resolve over a student message staff have not seen (reply/resolve race).
          ...(status === 'RESOLVED' ? { lastMessageAt: { lte: fields.staffReadAt } } : {}),
        },
        data:
          status === 'RESOLVED'
            ? { status, resolvedAt: new Date(), resolvedByUserId: userId }
            : { status, resolvedAt: null, resolvedByUserId: null },
      });
      if (changed.count !== 1) {
        if (!(await tx.messageThread.findUnique({ where: { id }, select: { id: true } })))
          throw Errors.notFound();
        throw new AppError(
          HttpStatus.CONFLICT,
          'CONFLICT',
          'This conversation changed (status or a new message). Refresh before trying again.',
        );
      }
      await this.audit.writeAuditEvent(
        {
          actorUserId: userId,
          action:
            status === 'RESOLVED'
              ? AUDIT_ACTIONS.messageThreadResolved
              : AUDIT_ACTIONS.messageThreadReopened,
          entityType: ENTITY,
          entityId: id,
          metadata: { status },
        },
        tx,
      );
    });
    return this.detail(id, 'staff');
  }
}
