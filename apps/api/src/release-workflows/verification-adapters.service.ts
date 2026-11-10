import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '@docversity/types';
import { WorkflowPolicyService, workflowDigest } from './workflow-policy.service.js';
import { Errors } from '../common/app-error.js';
@Injectable()
export class VerificationAdaptersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: WorkflowPolicyService,
    private readonly audit: AuditService,
  ) {}
  async lookup(
    service: 'result' | 'registration' | 'certificate' | 'admission-letter',
    reference: string,
    actor: string,
  ) {
    const policy = this.policy.current();
    let valid = false;
    if (service === 'certificate') {
      const c = await this.prisma.client.certificate.findFirst({
        where: {
          certificateNumber: reference,
          status: 'ISSUED',
          studentRegistrationId: { in: policy.registrationIds },
          pdfHash: { not: null },
          pdfStorageKey: { not: null },
        },
      });
      valid = Boolean(
        c &&
        z
          .object({
            usage: z.literal('SYNTHETIC_ONLY'),
            unsigned: z.literal(true),
            registrationId: z.literal(c.studentRegistrationId),
          })
          .safeParse(c.sourceSnapshot).success,
      );
    } else if (z.uuid().safeParse(reference).success) {
      const r = await this.prisma.client.syntheticRelease.findFirst({
        where: {
          id: reference,
          kind:
            service === 'result'
              ? 'RESULT'
              : service === 'registration'
                ? 'REGISTRATION'
                : 'ADMISSION_LETTER',
          status: 'PUBLISHED',
          registrationId: { in: policy.registrationIds },
          approvedById: { not: null },
          publishedById: { not: null },
          publishedAt: { not: null },
        },
      });
      valid = r ? r.sourceDigest === workflowDigest(r.snapshot) : false;
    }
    const result = {
      contractVersion: 1,
      service,
      usage: 'SYNTHETIC_ONLY',
      status: valid ? 'SAMPLE_VALID' : 'SAMPLE_NOT_VALID',
      officialVerificationAvailable: false,
      unsigned: true,
    };
    await this.audit.writeAuditEvent({
      actorUserId: actor,
      action: AUDIT_ACTIONS.syntheticWorkflowChanged,
      entityType: 'SyntheticVerification',
      metadata: { service, outcome: result.status, referenceDigest: workflowDigest(reference) },
    });
    return result;
  }
  async admissions(studentId: string, id?: string) {
    if (!this.policy.enabled()) return [];
    const policy = this.policy.current();
    const rows = await this.prisma.client.syntheticRelease.findMany({
      where: {
        ...(id ? { id } : {}),
        kind: 'ADMISSION_LETTER',
        registrationId: { in: policy.registrationIds },
        registration: { studentId },
        status: 'PUBLISHED',
        approvedById: { not: null },
        publishedById: { not: null },
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => {
      if (r.sourceDigest !== workflowDigest(r.snapshot)) throw Errors.notFound();
      return {
        id: r.id,
        registrationId: r.registrationId,
        usage: 'SYNTHETIC_ONLY',
        label: 'SAMPLE admission letter — not an admission decision',
        publishedAt: r.publishedAt,
      };
    });
  }
}
