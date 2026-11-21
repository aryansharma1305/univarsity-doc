import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { type Permission, permissionsForRoles } from '@docversity/types';
import type {
  Notification,
  NotificationList,
  NotificationQuery,
  NotificationType,
  UnreadCount,
} from '@docversity/validation';
import { Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';

/** The notification's recipient: exactly one student or one staff user. */
export type Recipient = { studentId: string } | { userId: string };

export interface NotificationInput {
  type: NotificationType;
  /** Minimal copy: never message text, marks, identity numbers or other personal values. */
  title: string;
  body: string;
  /** In-app path (database CHECK: /student/... or /admin/...). */
  link?: string;
  /** Stable per event, e.g. `message:<id>`; the recipient is appended. */
  event: string;
}

const view = (row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): Notification => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const where = (recipient: Recipient): Prisma.NotificationWhereInput =>
  'studentId' in recipient ? { studentId: recipient.studentId } : { userId: recipient.userId };

/**
 * In-app notifications (no email, SMS or WhatsApp delivery exists). Issued inside the caller's
 * transaction so a notification exists only if its event committed; idempotent per recipient.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyStudent(tx: Prisma.TransactionClient, studentId: string, n: NotificationInput) {
    await tx.notification.createMany({
      data: [{ ...this.fields(n), studentId, dedupeKey: `${n.event}:s:${studentId}` }],
      skipDuplicates: true,
    });
  }

  /** Every ACTIVE staff user whose roles grant `permission` (except the acting user). */
  async notifyStaff(
    tx: Prisma.TransactionClient,
    permission: Permission,
    n: NotificationInput,
    exceptUserId?: string,
  ) {
    const users = await tx.user.findMany({
      where: { status: 'ACTIVE', ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    const recipients = users.filter((u) =>
      permissionsForRoles(u.roles.map((r) => r.role.name)).has(permission),
    );
    if (!recipients.length) return;
    await tx.notification.createMany({
      data: recipients.map((u) => ({
        ...this.fields(n),
        userId: u.id,
        dedupeKey: `${n.event}:u:${u.id}`,
      })),
      skipDuplicates: true,
    });
  }

  async list(recipient: Recipient, query: NotificationQuery): Promise<NotificationList> {
    const filter: Prisma.NotificationWhereInput = {
      ...where(recipient),
      ...(query.unread ? { readAt: null } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.notification.count({ where: filter }),
      this.prisma.client.notification.findMany({
        where: filter,
        orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map(view),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async unread(recipient: Recipient): Promise<UnreadCount> {
    return {
      unread: await this.prisma.client.notification.count({
        where: { ...where(recipient), readAt: null },
      }),
    };
  }

  /** Marks one of the recipient's own notifications read (404 for anyone else's). */
  async markRead(recipient: Recipient, id: string): Promise<Notification> {
    await this.prisma.client.notification.updateMany({
      where: { id, ...where(recipient), readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.client.notification.findFirst({
      where: { id, ...where(recipient) },
    });
    if (!row) throw Errors.notFound();
    return view(row);
  }

  async markAllRead(recipient: Recipient): Promise<UnreadCount> {
    await this.prisma.client.notification.updateMany({
      where: { ...where(recipient), readAt: null },
      data: { readAt: new Date() },
    });
    return { unread: 0 };
  }

  private fields(n: NotificationInput) {
    return { type: n.type, title: n.title, body: n.body, link: n.link ?? null };
  }
}
