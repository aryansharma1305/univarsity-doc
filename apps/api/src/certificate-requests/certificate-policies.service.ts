import { z } from 'zod';
import type { Prisma } from '@docversity/database';
import { PrismaService } from '../database/prisma.service.js';
import { VerificationPoliciesService } from '../public-verification/verification-policies.service.js';
import { Inject, Injectable } from '@nestjs/common';
import {
  certificateApplicationPolicySchema,
  certificateReviewPolicySchema,
  type CertificateApplicationPolicy,
} from '@docversity/validation';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
@Injectable()
export class CertificatePoliciesService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly prisma: PrismaService,
    private readonly authority: VerificationPoliciesService,
  ) {}
  // Legacy synthetic policies remain test-only. Live rules come only from approved scoped authority.
  definitions(): readonly unknown[] {
    return [];
  }
  reviewDefinition(): unknown {
    return null;
  }
  canComplete(type: string): boolean {
    const policy = certificateReviewPolicySchema.safeParse(this.reviewDefinition());
    return (
      this.config.NODE_ENV === 'test' &&
      policy.success &&
      policy.data.certificateTypes.some((t) => t === type)
    );
  }
  async authorized(
    type: string,
    studentId: string,
    tx: Prisma.TransactionClient = this.prisma.client,
    policyId?: string,
    requireActive = false,
  ): Promise<CertificateApplicationPolicy | null> {
    const synthetic = this.get(type);
    if (synthetic) return synthetic;
    if (policyId && !z.uuid().safeParse(policyId).success) return null;
    if (tx !== this.prisma.client)
      await tx.$queryRaw`SELECT id FROM student_registrations WHERE student_id=${studentId}::uuid FOR SHARE`;
    const registrations = await tx.studentRegistration.findMany({
      where: { studentId, ...(requireActive ? { status: 'ACTIVE' } : {}) },
      select: { programId: true },
    });
    for (const r of registrations) {
      const p = await this.authority.application(type, r.programId, tx, policyId);
      if (p) return p;
    }
    return null;
  }
  async authorizedReview(
    r: { certificateType: string; studentId: string; policyId: string; policyVersion: number },
    tx: Prisma.TransactionClient = this.prisma.client,
  ) {
    if (this.canComplete(r.certificateType)) return true;
    const p = await this.authorized(r.certificateType, r.studentId, tx, r.policyId);
    return !!p && p.id === r.policyId && p.version === r.policyVersion;
  }
  get(type: string): CertificateApplicationPolicy | null {
    for (const definition of this.definitions()) {
      const parsed = certificateApplicationPolicySchema.safeParse(definition);
      if (parsed.success && parsed.data.certificateType === type) {
        // The only implemented eligibility evaluator is isolated-test-only, never a live policy.
        if (this.config.NODE_ENV === 'test') return parsed.data;
      }
    }
    return null;
  }
}
