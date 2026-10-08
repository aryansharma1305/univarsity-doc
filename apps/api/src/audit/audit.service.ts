import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import type { AuditAction } from '@docversity/types';
import { currentRequestId } from '../common/request-context.js';
import { redact } from '../common/json-logger.js';
import { PrismaService } from '../database/prisma.service.js';

export interface AuditEvent {
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Context for investigators. Sensitive keys (password, token, secret, …) are redacted. */
  metadata?: Record<string, unknown>;
  /** Defaults to the current request's correlation ID. */
  correlationId?: string | null;
}

/**
 * The only way application code writes audit entries. Append-only by design: there is no update
 * or delete method, and the audit_logs table rejects UPDATE/DELETE/TRUNCATE at the database level.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one audit entry. Pass the transaction client (`tx`) when auditing a data change so the
   * change and its audit entry commit — or roll back — together.
   */
  async writeAuditEvent(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).auditLog.create({
      data: {
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        ...(event.metadata ? { metadata: redact(event.metadata) as object } : {}),
        correlationId: event.correlationId ?? currentRequestId() ?? null,
      },
    });
  }
}
