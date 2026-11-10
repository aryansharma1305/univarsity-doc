import { Injectable } from '@nestjs/common';
import { legacyDryRun } from '@docversity/imports';
import { AUDIT_ACTIONS } from '@docversity/types';
import { z } from 'zod';
import type { LegacyRecovery, LegacyDryRun } from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  WorkflowPolicyService,
  workflowConflict,
  workflowDigest,
} from './workflow-policy.service.js';
import { Errors } from '../common/app-error.js';
@Injectable()
export class LegacyMigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: WorkflowPolicyService,
  ) {}
  async prepare(body: LegacyDryRun, actor: string) {
    this.policy.current();
    const report = legacyDryRun(body);
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.id}))`;
      const prior = await tx.legacyMigrationBatch.findUnique({ where: { id: body.id } });
      if (prior) {
        if (prior.sourceDigest !== report.sourceDigest || prior.actorUserId !== actor)
          throw workflowConflict();
        return prior;
      }
      const batch = await tx.legacyMigrationBatch.create({
        data: {
          id: body.id,
          sourceDigest: report.sourceDigest,
          planDigest: report.planDigest,
          report,
          actorUserId: actor,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'LegacyMigrationBatch',
          entityId: batch.id,
          metadata: { action: 'DRY_RUN', counts: report.counts, importAllowed: false },
        },
        tx,
      );
      return batch;
    });
  }
  async recover(id: string, body: LegacyRecovery, actor: string) {
    this.policy.current();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM legacy_migration_batches WHERE id=${id}::uuid FOR UPDATE`;
      const batch = await tx.legacyMigrationBatch.findUnique({ where: { id } });
      if (batch?.actorUserId !== actor) throw Errors.notFound();
      const digest = workflowDigest({ id, body, actor });
      const prior = await tx.auditLog.findFirst({
        where: {
          entityType: 'LegacyMigrationBatch',
          entityId: id,
          metadata: { path: ['requestId'], equals: body.requestId },
        },
      });
      if (prior) {
        const m = z.object({ digest: z.string() }).parse(prior.metadata);
        if (m.digest !== digest) throw workflowConflict();
        return batch;
      }
      if (batch.planDigest !== body.planDigest || batch.checkpoint !== body.expectedCheckpoint)
        throw workflowConflict();
      const report = z
        .object({ rows: z.array(z.unknown()), counts: z.object({ quarantined: z.number() }) })
        .parse(batch.report);
      if (workflowDigest(report.rows) !== batch.planDigest) throw workflowConflict();
      const count = report.rows.length;
      const checkpoint = Math.min(count, body.expectedCheckpoint + 100);
      const changed = await tx.legacyMigrationBatch.update({
        where: { id },
        data: {
          checkpoint,
          state:
            checkpoint === count
              ? report.counts.quarantined
                ? 'QUARANTINED'
                : 'RECONCILED'
              : 'DRY_RUN',
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'LegacyMigrationBatch',
          entityId: id,
          metadata: {
            action: 'RECOVER',
            requestId: body.requestId,
            digest,
            checkpoint,
            importAllowed: false,
          },
        },
        tx,
      );
      return changed;
    });
  }
}
