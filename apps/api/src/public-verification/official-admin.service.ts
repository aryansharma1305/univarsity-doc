import { officialDocumentSnapshotSchema } from '@docversity/validation';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  officialPolicyListSchema,
  officialStaffDocumentListSchema,
  officialTemplateListSchema,
  verificationAuditListSchema,
  type officialPolicyQuerySchema,
  type officialDocumentQuerySchema,
  type officialTemplateQuerySchema,
  type verificationAuditQuerySchema,
} from '@docversity/validation';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service.js';
import { VerificationPoliciesService } from './verification-policies.service.js';
const meta = (q: { page: number; pageSize: number }, total: number) => ({
  ...q,
  total,
  totalPages: Math.ceil(total / q.pageSize),
});
const page = (q: { page: number; pageSize: number }) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});
@Injectable()
export class OfficialAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: VerificationPoliciesService,
  ) {}
  async policyList(q: z.infer<typeof officialPolicyQuerySchema>) {
    const where: Prisma.VerificationPolicyWhereInput = {
      ...(q.programId ? { programId: q.programId } : {}),
      ...(q.service ? { service: q.service } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { definition: { path: ['institutionName'], string_contains: q.search } } : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.verificationPolicy.findMany({
        where,
        orderBy: [{ createdAt: q.sortOrder }, { id: 'asc' }],
        ...page(q),
      }),
      this.prisma.client.verificationPolicy.count({ where }),
    ]);
    return officialPolicyListSchema.parse({
      data: rows.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        approvedAt: p.approvedAt?.toISOString() ?? null,
        approvalAvailable: !!this.policies.allowed(p.definition),
      })),
      meta: meta({ page: q.page, pageSize: q.pageSize }, total),
    });
  }
  async documents(q: z.infer<typeof officialDocumentQuerySchema>) {
    const where: Prisma.CertificateWhereInput = {
      sourceSnapshot: { path: ['usage'], equals: 'OFFICIAL' },
      ...(q.programId ? { programId: q.programId } : {}),
      ...(q.documentType ? { documentType: q.documentType } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { certificateNumber: { contains: q.search, mode: 'insensitive' } },
              {
                studentRegistration: {
                  registrationNumberNormalized: { contains: q.search.toUpperCase() },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.certificate.findMany({
        where,
        include: {
          studentRegistration: { select: { registrationNumber: true } },
          program: { select: { name: true } },
        },
        orderBy: [{ createdAt: q.sortOrder }, { id: 'asc' }],
        ...page(q),
      }),
      this.prisma.client.certificate.count({ where }),
    ]);
    return officialStaffDocumentListSchema.parse({
      data: rows.map((c) => ({
        id: c.id,
        certificateNumber: c.certificateNumber,
        documentType: c.documentType,
        status: c.status,
        registrationNumber: c.studentRegistration.registrationNumber,
        program: officialDocumentSnapshotSchema.parse(c.sourceSnapshot).programName,
        institution: officialDocumentSnapshotSchema.parse(c.sourceSnapshot).institutionName,
        authorityReference: officialDocumentSnapshotSchema.parse(c.sourceSnapshot)
          .authorityReference,
        issueDate: c.issueDate?.toISOString().slice(0, 10) ?? null,
        generatedByUserId: c.generatedByUserId,
        pdfSource: officialDocumentSnapshotSchema.parse(c.sourceSnapshot).pdfSource ?? null,
      })),
      meta: meta({ page: q.page, pageSize: q.pageSize }, total),
    });
  }
  async templates(q: z.infer<typeof officialTemplateQuerySchema>) {
    const where: Prisma.CertificateTemplateWhereInput = {
      ...(q.documentType ? { documentType: q.documentType } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.programId ? { programMappings: { some: { programId: q.programId } } } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.certificateTemplate.findMany({
        where,
        include: { programMappings: { select: { programId: true } } },
        orderBy: [{ createdAt: q.sortOrder }, { id: 'asc' }],
        ...page(q),
      }),
      this.prisma.client.certificateTemplate.count({ where }),
    ]);
    const receipts = await this.prisma.client.auditLog.findMany({
      where: {
        entityType: 'CertificateTemplate',
        entityId: { in: rows.map((t) => t.id) },
        action: AUDIT_ACTIONS.officialDocumentChanged,
        metadata: { path: ['action'], equals: 'PREPARE_TEMPLATE' },
      },
      select: { entityId: true, actorUserId: true, metadata: true },
    });
    return officialTemplateListSchema.parse({
      data: rows.map((t) => {
        const receipt = receipts.find((r) => r.entityId === t.id);
        const scope = z.object({ programId: z.uuid() }).safeParse(receipt?.metadata);
        return {
          id: t.id,
          name: t.name,
          documentType: t.documentType,
          version: t.version,
          status: t.status,
          programIds: scope.success
            ? [scope.data.programId]
            : t.programMappings.map((m) => m.programId),
          generatedByUserId: receipt?.actorUserId ?? null,
        };
      }),
      meta: meta({ page: q.page, pageSize: q.pageSize }, total),
    });
  }
  async audit(q: z.infer<typeof verificationAuditQuerySchema>) {
    const where: Prisma.AuditLogWhereInput = {
      action: {
        in: [
          AUDIT_ACTIONS.verificationPolicyChanged,
          AUDIT_ACTIONS.officialDocumentChanged,
          AUDIT_ACTIONS.officialResultPublished,
          AUDIT_ACTIONS.publicVerificationChecked,
        ],
      },
      ...(q.entityId ? { entityId: q.entityId } : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.auditLog.findMany({
        where,
        include: { actor: { select: { displayName: true } } },
        orderBy: [{ createdAt: q.sortOrder }, { id: 'asc' }],
        ...page(q),
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);
    return verificationAuditListSchema.parse({
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actor?.displayName ?? null,
        createdAt: r.createdAt.toISOString(),
        metadata: r.metadata,
      })),
      meta: meta({ page: q.page, pageSize: q.pageSize }, total),
    });
  }
}
