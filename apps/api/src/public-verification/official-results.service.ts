import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  officialPublishedResultSchema,
  type attestOfficialResultSchema,
  type publishOfficialResultSchema,
} from '@docversity/validation';
import type { z } from 'zod';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { VerificationPoliciesService } from './verification-policies.service.js';
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const conflict = () =>
  new AppError(
    HttpStatus.CONFLICT,
    'CONFLICT',
    'An unchanged, officially reviewed result and current publication authority are required.',
  );
@Injectable()
export class OfficialResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policies: VerificationPoliciesService,
  ) {}
  async attest(id: string, body: z.infer<typeof attestOfficialResultSchema>, actor: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM results WHERE id=${id}::uuid FOR UPDATE`;
      const r = await tx.result.findUnique({
        where: { id },
        include: { studentRegistration: true, items: true },
      });
      if (!r) throw Errors.notFound();
      if (
        r.publicationStatus !== 'DRAFT' ||
        r.publishedAt ||
        r.version !== body.expectedVersion ||
        !(await this.policies.current('result', r.studentRegistration.programId, tx, body.policyId))
      )
        throw conflict();
      if (
        new Set(body.subjects.map((s) => s.id)).size !== r.items.length ||
        body.subjects.length !== r.items.length ||
        r.items.some((i) => !body.subjects.some((s) => s.id === i.id))
      )
        throw conflict();
      // Record the university's supplied decisions. Never infer a grade or pass/fail from marks.
      for (const item of body.subjects)
        await tx.resultItem.update({
          where: { id: item.id },
          data: { status: item.status, grade: item.grade },
        });
      const { outcome, totalMarks, maxMarks, sgpa, cgpa } = body;
      const changed = await tx.result.update({
        where: { id },
        data: {
          outcome,
          totalMarks,
          maxMarks,
          sgpa,
          cgpa,
          version: { increment: 1 },
          calculationSnapshot: {
            usage: 'OFFICIAL_ATTESTED',
            authorityReference: body.authorityReference,
            policyId: body.policyId,
          },
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.officialResultPublished,
          entityType: 'Result',
          entityId: id,
          metadata: { action: 'ATTEST', policyId: body.policyId, version: changed.version },
        },
        tx,
      );
      return { id, version: changed.version };
    });
  }
  async publish(id: string, body: z.infer<typeof publishOfficialResultSchema>, actor: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM results WHERE id=${id}::uuid FOR UPDATE`;
      const r = await tx.result.findUnique({
        where: { id },
        include: {
          studentRegistration: true,
          items: true,
          reviewEvents: { orderBy: { resultVersion: 'desc' } },
        },
      });
      if (!r) throw Errors.notFound();
      const policy = await this.policies.current(
        'result',
        r.studentRegistration.programId,
        tx,
        body.policyId,
      );
      if (
        !policy ||
        r.publicationStatus !== 'APPROVED' ||
        r.publishedAt ||
        r.version !== body.expectedVersion ||
        !r.approvedAt ||
        !r.outcome ||
        r.items.some((i) => !i.status)
      )
        throw conflict();
      const authority = r.calculationSnapshot as { usage?: string; policyId?: string } | null;
      if (authority?.usage !== 'OFFICIAL_ATTESTED' || authority.policyId !== policy.id)
        throw conflict();
      const approval = r.reviewEvents.find(
        (e) => e.action === 'APPROVE' && e.resultVersion === r.version && e.toStatus === 'APPROVED',
      );
      const submitted = r.reviewEvents.find((e) => e.action === 'SUBMIT');
      const attestation = await tx.auditLog.findFirst({
        where: {
          entityType: 'Result',
          entityId: id,
          action: AUDIT_ACTIONS.officialResultPublished,
          metadata: { path: ['action'], equals: 'ATTEST' },
        },
        orderBy: { createdAt: 'desc' },
      });
      const current = await tx.$queryRaw<
        { snapshot: unknown }[]
      >`SELECT docversity_result_review_snapshot(${id}::uuid) AS snapshot`;
      if (
        !approval ||
        !submitted ||
        !attestation?.actorUserId ||
        approval.actorUserId === submitted.actorUserId ||
        approval.actorUserId === attestation.actorUserId ||
        digest(approval.snapshot) !== digest(submitted.snapshot) ||
        digest(approval.snapshot) !== digest(current[0]?.snapshot)
      )
        throw conflict();
      await tx.resultPublication.create({
        data: {
          resultId: id,
          policyId: policy.id,
          approvalEventId: approval.id,
          publishedById: actor,
          snapshotDigest: digest(approval.snapshot),
        },
      });
      await tx.result.update({
        where: { id },
        data: { publicationStatus: 'PUBLISHED', publishedAt: new Date() },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.officialResultPublished,
          entityType: 'Result',
          entityId: id,
          metadata: { action: 'PUBLISH', policyId: policy.id },
        },
        tx,
      );
      return { id, status: 'PUBLISHED' };
    });
  }
  async withdraw(id: string, actor: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM results WHERE id=${id}::uuid FOR UPDATE`;
      const r = await tx.result.findUnique({ where: { id } });
      if (
        r?.publicationStatus !== 'PUBLISHED' ||
        !(await tx.resultPublication.findUnique({ where: { resultId: id } }))
      )
        throw Errors.notFound();
      await tx.result.update({ where: { id }, data: { publicationStatus: 'WITHHELD' } });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.officialResultPublished,
          entityType: 'Result',
          entityId: id,
          metadata: { action: 'WITHDRAW' },
        },
        tx,
      );
      return { id, status: 'WITHHELD' };
    });
  }
  async list(
    studentId: string,
    filter: {
      registrationId?: string;
      periodNumber?: number;
      examinationId?: string;
      id?: string;
    } = {},
  ) {
    const authorities = await this.prisma.client.verificationPolicy.findMany({
      where: {
        service: 'result',
        status: 'APPROVED',
        program: { registrations: { some: { studentId } } },
      },
    });
    const policyIds = authorities
      .filter(
        (p) =>
          p.approvedById &&
          p.approvedById !== p.proposedById &&
          p.approvedAt &&
          this.policies.allowed(p.definition),
      )
      .map((p) => p.id);
    if (!policyIds.length) return [];
    const rows = await this.prisma.client.result.findMany({
      where: {
        officialPublication: { policyId: { in: policyIds } },
        ...(filter.id ? { id: filter.id } : {}),
        studentRegistration: {
          studentId,
          ...(filter.registrationId ? { id: filter.registrationId } : {}),
        },
        publicationStatus: 'PUBLISHED',
        approvedAt: { not: null },
        publishedAt: { not: null },
        examination: {
          ...(filter.periodNumber ? { semesterNumber: filter.periodNumber } : {}),
          ...(filter.examinationId ? { id: filter.examinationId } : {}),
        },
      },
      include: {
        studentRegistration: true,
        examination: true,
        items: { include: { programSubject: { include: { subject: true } } } },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    const visible = [];
    for (const r of rows) {
      if (!r.publishedAt) continue;
      const receipt = await this.prisma.client.resultPublication.findUnique({
        where: { resultId: r.id },
      });
      if (
        !receipt ||
        !(await this.policies.current(
          'result',
          r.studentRegistration.programId,
          this.prisma.client,
          receipt.policyId,
        ))
      )
        continue;
      visible.push(
        officialPublishedResultSchema.parse({
          id: r.id,
          usage: 'OFFICIAL',
          label: 'Official published result',
          examination: r.examination.name,
          examinationId: r.examinationId,
          periodNumber: r.examination.semesterNumber,
          attemptNumber: r.attemptNumber,
          publishedAt: r.publishedAt.toISOString(),
          sgpa: r.sgpa?.toString() ?? null,
          outcome: r.outcome,
          subjects: r.items.map((i) => ({
            programSubjectId: i.programSubjectId,
            code: i.programSubject.subject.code,
            name: i.programSubject.subject.name,
            internalMarks: i.internalMarks?.toString() ?? null,
            externalMarks: i.externalMarks?.toString() ?? null,
            practicalMarks: i.practicalMarks?.toString() ?? null,
            otherMarks: i.otherMarks?.toString() ?? null,
            totalMarks: i.totalMarks?.toString() ?? null,
            maxMarks: i.maxMarks?.toString() ?? null,
            grade: i.grade,
            status: i.status,
          })),
        }),
      );
    }
    return visible;
  }
}
