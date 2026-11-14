import { verificationPolicyRecordSchema } from '@docversity/validation';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  verificationPolicyDefinitionSchema,
  type PublicVerificationService,
  type proposeVerificationPolicySchema,
} from '@docversity/validation';
import type { z } from 'zod';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { Errors } from '../common/app-error.js';

@Injectable()
export class VerificationPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  allowed(definition: unknown) {
    const p = verificationPolicyDefinitionSchema.safeParse(definition);
    if (!p.success) return null;
    if (
      p.data.usage === 'SYNTHETIC_ONLY'
        ? this.config.NODE_ENV !== 'test'
        : !this.config.OFFICIAL_VERIFICATION_ENABLED
    )
      return null;
    return p.data;
  }
  async current(
    service: PublicVerificationService,
    programId: string,
    tx: Prisma.TransactionClient = this.prisma.client,
    id?: string,
  ) {
    if (tx !== this.prisma.client)
      await tx.$queryRaw`SELECT id FROM verification_policies WHERE service=${service} AND program_id=${programId}::uuid AND status='APPROVED' FOR SHARE`;
    const p = await tx.verificationPolicy.findFirst({
      where: { ...(id ? { id } : {}), service, programId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!p?.approvedById || p.approvedById === p.proposedById || !p.approvedAt) return null;
    const definition = this.allowed(p.definition);
    return definition ? { ...p, definition } : null;
  }
  async list() {
    const rows = await this.prisma.client.verificationPolicy.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((p) => verificationPolicyRecordSchema.parse(p));
  }
  async propose(body: z.infer<typeof proposeVerificationPolicySchema>, actor: string) {
    // A draft is evidence for review, never authority to disclose a record.
    return this.prisma.client.$transaction(async (tx) => {
      if (!(await tx.program.findUnique({ where: { id: body.programId } })))
        throw Errors.notFound();
      const p = await tx.verificationPolicy.create({ data: { ...body, proposedById: actor } });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.verificationPolicyChanged,
          entityType: 'VerificationPolicy',
          entityId: p.id,
          metadata: { action: 'PROPOSE', service: p.service },
        },
        tx,
      );
      return p;
    });
  }
  async transition(id: string, action: 'APPROVE' | 'WITHDRAW', actor: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM verification_policies WHERE id=${id}::uuid FOR UPDATE`;
      const p = await tx.verificationPolicy.findUnique({ where: { id } });
      if (!p) throw Errors.notFound();
      if (
        action === 'APPROVE' &&
        (p.status !== 'DRAFT' || p.proposedById === actor || !this.allowed(p.definition))
      )
        throw Errors.forbidden();
      if (action === 'WITHDRAW' && p.status !== 'APPROVED') throw Errors.forbidden();
      const changed = await tx.verificationPolicy.update({
        where: { id },
        data:
          action === 'APPROVE'
            ? { status: 'APPROVED', approvedById: actor, approvedAt: new Date() }
            : { status: 'WITHDRAWN' },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.verificationPolicyChanged,
          entityType: 'VerificationPolicy',
          entityId: id,
          metadata: { action },
        },
        tx,
      );
      return changed;
    });
  }
}
