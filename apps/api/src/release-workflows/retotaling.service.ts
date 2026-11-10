import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  retotalingReceiptSchema,
  type SubmitRetotaling,
  type WorkflowCommand,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import {
  WorkflowPolicyService,
  workflowConflict,
  workflowDigest,
} from './workflow-policy.service.js';
@Injectable()
export class RetotalingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: WorkflowPolicyService,
  ) {}
  private present(r: {
    id: string;
    registrationId: string;
    releaseId: string;
    reason: string;
    status: string;
    version: number;
    createdAt: Date;
  }) {
    return retotalingReceiptSchema.parse({
      id: r.id,
      registrationId: r.registrationId,
      releaseId: r.releaseId,
      reason: r.reason,
      status: r.status,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      usage: 'SYNTHETIC_ONLY',
      feeStatus: 'NOT_CONFIGURED',
      academicDecision: 'NONE',
    });
  }
  async list(studentId?: string) {
    const policy = this.policy.current();
    const rows = await this.prisma.client.retotalingRequest.findMany({
      where: {
        registrationId: { in: policy.registrationIds },
        ...(studentId ? { registration: { studentId } } : {}),
      },
      include: { events: { orderBy: { version: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      ...this.present(r),
      events: r.events.map((e) => ({
        version: e.version,
        status: e.status,
        action: e.action,
        message: e.message,
        createdAt: e.createdAt,
      })),
    }));
  }
  async submit(studentId: string, accountId: string, body: SubmitRetotaling) {
    const policy = this.policy.current();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM student_accounts WHERE id=${accountId}::uuid FOR SHARE`;
      if (
        !(await tx.studentAccount.findFirst({
          where: { id: accountId, studentId, status: 'ACTIVE' },
        }))
      )
        throw Errors.notFound();
      await tx.$queryRaw`SELECT id FROM synthetic_releases WHERE id=${body.releaseId}::uuid FOR SHARE`;
      const release = await tx.syntheticRelease.findFirst({
        where: {
          id: body.releaseId,
          kind: 'RESULT',
          status: 'PUBLISHED',
          registrationId: { in: policy.registrationIds },
          registration: { studentId },
        },
      });
      if (!release) throw Errors.notFound();
      await tx.$queryRaw`SELECT id FROM student_registrations WHERE id=${release.registrationId}::uuid FOR UPDATE`;
      const requestDigest = workflowDigest(body);
      const prior = await tx.retotalingRequest.findUnique({
        where: {
          registrationId_submissionKey: {
            registrationId: release.registrationId,
            submissionKey: body.submissionKey,
          },
        },
      });
      if (prior) {
        if (prior.requestDigest !== requestDigest) throw workflowConflict();
        return this.present(prior);
      }
      if (
        await tx.retotalingRequest.findFirst({
          where: { releaseId: release.id, status: { notIn: ['CANCELLED', 'CLOSED'] } },
        })
      )
        throw workflowConflict();
      const r = await tx.retotalingRequest.create({
        data: {
          registrationId: release.registrationId,
          releaseId: release.id,
          submissionKey: body.submissionKey,
          requestDigest,
          reason: body.reason,
        },
      });
      await tx.retotalingEvent.create({
        data: {
          id: randomUUID(),
          requestId: r.id,
          version: 1,
          action: 'SUBMIT',
          status: r.status,
          actorAccountId: accountId,
          requestDigest,
        },
      });
      await this.audit.writeAuditEvent(
        {
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'RetotalingRequest',
          entityId: r.id,
          metadata: { action: 'SUBMIT', feeStatus: 'NOT_CONFIGURED', academicDecision: 'NONE' },
        },
        tx,
      );
      return this.present(r);
    });
  }
  async transition(
    id: string,
    action: 'REQUEST_INFORMATION' | 'RESPOND' | 'CANCEL' | 'CLOSE',
    body: WorkflowCommand,
    actor: { userId: string } | { studentId: string; accountId: string },
  ) {
    const policy = this.policy.current();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM retotaling_requests WHERE id=${id}::uuid FOR UPDATE`;
      const r = await tx.retotalingRequest.findFirst({
        where: {
          id,
          registrationId: { in: policy.registrationIds },
          ...('studentId' in actor ? { registration: { studentId: actor.studentId } } : {}),
        },
      });
      if (!r) throw Errors.notFound();
      const digest = workflowDigest({ id, action, body, actor });
      const previous = await tx.retotalingEvent.findUnique({ where: { id: body.requestId } });
      if (previous) {
        if (previous.requestId !== id || previous.requestDigest !== digest)
          throw workflowConflict();
        return this.present({ ...r, status: previous.status, version: previous.version });
      }
      if (r.version !== body.version) throw workflowConflict();
      let status: string;
      if (
        action === 'REQUEST_INFORMATION' &&
        'userId' in actor &&
        ['SUBMITTED', 'INFORMATION_PROVIDED'].includes(r.status) &&
        body.message
      )
        status = 'INFORMATION_REQUESTED';
      else if (
        action === 'RESPOND' &&
        'studentId' in actor &&
        r.status === 'INFORMATION_REQUESTED' &&
        body.message
      )
        status = 'INFORMATION_PROVIDED';
      else if (
        action === 'CANCEL' &&
        'studentId' in actor &&
        !['CANCELLED', 'CLOSED'].includes(r.status)
      )
        status = 'CANCELLED';
      else if (
        action === 'CLOSE' &&
        'userId' in actor &&
        !['CANCELLED', 'CLOSED'].includes(r.status) &&
        body.message
      )
        status = 'CLOSED';
      else throw workflowConflict();
      const changed = await tx.retotalingRequest.update({
        where: { id },
        data: { status, version: { increment: 1 } },
      });
      await tx.retotalingEvent.create({
        data: {
          id: body.requestId,
          requestId: id,
          version: changed.version,
          status,
          action,
          message: body.message,
          ...('userId' in actor
            ? { actorUserId: actor.userId }
            : { actorAccountId: actor.accountId }),
          requestDigest: digest,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: 'userId' in actor ? actor.userId : null,
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'RetotalingRequest',
          entityId: id,
          metadata: {
            action,
            version: changed.version,
            feeStatus: 'NOT_CONFIGURED',
            academicDecision: 'NONE',
          },
        },
        tx,
      );
      return this.present(changed);
    });
  }
}
