import { Injectable } from '@nestjs/common';
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

  async writeAuditEvent(event: AuditEvent): Promise<void> {
    await this.prisma.client.auditLog.create({
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
