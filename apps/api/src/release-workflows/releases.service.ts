import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  syntheticPublishedResultSchema,
  studentResultsPageSchema,
  type PrepareRelease,
  type WorkflowCommand,
  type StudentResultsQuery,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/app-error.js';
import { resultReviewSnapshotDigest } from '../results/result-review.service.js';
import {
  WorkflowPolicyService,
  workflowDigest,
  workflowConflict,
} from './workflow-policy.service.js';
const calculation = z.object({
  usage: z.literal('SYNTHETIC_ONLY'),
  officialPublicationAllowed: z.literal(false),
  resultId: z.uuid(),
  resultVersion: z.number().int().positive(),
  inputSnapshotDigest: z.string().length(64),
  sgpa: z.string().nullable(),
  outcome: z.string(),
  subjects: z.array(
    z.object({
      programSubjectId: z.uuid(),
      totalMarks: z.string().nullable(),
      maxMarks: z.string(),
      grade: z.string().nullable(),
    }),
  ),
});
@Injectable()
export class ReleasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: WorkflowPolicyService,
  ) {}
  async prepare(body: PrepareRelease, actor: string) {
    const policy = this.policy.current();
    if (!policy.registrationIds.includes(body.registrationId)) throw Errors.notFound();
    const requestDigest = workflowDigest({ body, actor });
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM student_registrations WHERE id=${body.registrationId}::uuid FOR SHARE`;
      const registration = await tx.studentRegistration.findUnique({
        where: { id: body.registrationId },
      });
      if (!registration || !['ACTIVE', 'COMPLETED'].includes(registration.status))
        throw Errors.notFound();
      const prior = await tx.syntheticRelease.findUnique({ where: { id: body.requestId } });
      if (prior) {
        if (prior.requestDigest !== requestDigest) throw workflowConflict();
        return this.receipt(prior);
      }
      let snapshot: object = {
        usage: 'SYNTHETIC_ONLY',
        fixtureReference: policy.fixtureReference,
        registrationId: registration.id,
        kind: body.kind,
        registrationNumber: registration.registrationNumber,
      };
      let approvalEventId: string | null = null;
      if (body.resultId) {
        await tx.$queryRaw`SELECT id FROM results WHERE id=${body.resultId}::uuid FOR SHARE`;
        const result = await tx.result.findUnique({
          where: { id: body.resultId },
          include: {
            examination: true,
            reviewEvents: { orderBy: { resultVersion: 'desc' } },
            items: { include: { programSubject: { include: { subject: true } } } },
          },
        });
        const approved = result?.reviewEvents.find(
          (e) =>
            e.action === 'APPROVE' &&
            e.toStatus === 'APPROVED' &&
            e.resultVersion === result.version,
        );
        const calculated = calculation.safeParse(result?.calculationSnapshot);
        const submitted = result?.reviewEvents.find(
          (e) =>
            e.action === 'SUBMIT' &&
            calculated.success &&
            e.resultVersion === calculated.data.resultVersion,
        );
        if (
          result?.studentRegistrationId !== registration.id ||
          result.publicationStatus !== 'APPROVED' ||
          !approved ||
          !submitted ||
          !calculated.success ||
          calculated.data.resultId !== result.id ||
          calculated.data.inputSnapshotDigest !== resultReviewSnapshotDigest(submitted.snapshot) ||
          resultReviewSnapshotDigest(approved.snapshot) !==
            resultReviewSnapshotDigest(submitted.snapshot)
        )
          throw workflowConflict();
        approvalEventId = approved.id;
        snapshot = {
          usage: 'SYNTHETIC_ONLY',
          fixtureReference: policy.fixtureReference,
          registrationId: registration.id,
          kind: 'RESULT',
          resultId: result.id,
          version: result.version,
          examination: result.examination.name,
          attemptNumber: result.attemptNumber,
          periodNumber: result.examination.semesterNumber,
          sgpa: calculated.data.sgpa,
          outcome: calculated.data.outcome,
          subjects: calculated.data.subjects.map((item) => {
            const source = result.items.find((i) => i.programSubjectId === item.programSubjectId);
            if (!source) throw workflowConflict();
            return {
              ...item,
              code: source.programSubject.subject.code,
              name: source.programSubject.subject.name,
            };
          }),
        };
      }
      const release = await tx.syntheticRelease.create({
        data: {
          id: body.requestId,
          kind: body.kind,
          registrationId: registration.id,
          resultId: body.resultId ?? null,
          approvalEventId,
          snapshot,
          sourceDigest: workflowDigest(snapshot),
          requestDigest,
          preparedById: actor,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'SyntheticRelease',
          entityId: release.id,
          metadata: { action: 'PREPARE', kind: body.kind },
        },
        tx,
      );
      return this.receipt(release);
    });
  }
  private receipt(r: { id: string; status: string; version: number }) {
    return {
      id: r.id,
      status: r.status,
      version: r.version,
      usage: 'SYNTHETIC_ONLY',
      officialPublicationAllowed: false,
    };
  }
  async transition(
    id: string,
    action: 'APPROVE' | 'PUBLISH' | 'WITHDRAW',
    body: WorkflowCommand,
    actor: string,
  ) {
    const policy = this.policy.current();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM synthetic_releases WHERE id=${id}::uuid FOR UPDATE`;
      const r = await tx.syntheticRelease.findUnique({ where: { id } });
      if (!r || !policy.registrationIds.includes(r.registrationId)) throw Errors.notFound();
      const digest = workflowDigest({ id, action, body, actor });
      const replay = await tx.auditLog.findFirst({
        where: {
          entityType: 'SyntheticRelease',
          entityId: id,
          metadata: { path: ['requestId'], equals: body.requestId },
        },
      });
      if (replay) {
        const m = z
          .object({
            digest: z.string(),
            receipt: z.object({
              id: z.string(),
              status: z.string(),
              version: z.number(),
              usage: z.literal('SYNTHETIC_ONLY'),
              officialPublicationAllowed: z.literal(false),
            }),
          })
          .parse(replay.metadata);
        if (m.digest !== digest) throw workflowConflict();
        return m.receipt;
      }
      if (r.version !== body.version || r.sourceDigest !== workflowDigest(r.snapshot))
        throw workflowConflict();
      let status: string;
      if (action === 'APPROVE' && r.status === 'DRAFT' && r.preparedById !== actor)
        status = 'APPROVED';
      else if (
        action === 'PUBLISH' &&
        r.status === 'APPROVED' &&
        r.approvedById &&
        r.preparedById !== actor
      )
        status = 'PUBLISHED';
      else if (action === 'WITHDRAW' && r.status === 'PUBLISHED' && body.message)
        status = 'WITHDRAWN';
      else throw workflowConflict();
      const changed = await tx.syntheticRelease.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          ...(action === 'APPROVE'
            ? { approvedById: actor, approvedAt: new Date() }
            : action === 'PUBLISH'
              ? { publishedById: actor, publishedAt: new Date() }
              : {}),
        },
      });
      const receipt = this.receipt({
        id: changed.id,
        status: changed.status,
        version: changed.version,
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.syntheticWorkflowChanged,
          entityType: 'SyntheticRelease',
          entityId: id,
          metadata: { action, requestId: body.requestId, digest, receipt },
        },
        tx,
      );
      return receipt;
    });
  }
  private visibleWhere(studentId: string, id?: string): Prisma.SyntheticReleaseWhereInput {
    const policy = this.policy.current();
    return {
      ...(id ? { id } : {}),
      kind: 'RESULT',
      status: 'PUBLISHED',
      registrationId: { in: policy.registrationIds },
      registration: { studentId },
      approvedById: { not: null },
      publishedById: { not: null },
      publishedAt: { not: null },
      approvalEventId: { not: null },
    };
  }
  private async visible(studentId: string, id?: string, page = 1, pageSize = 1) {
    return this.prisma.client.syntheticRelease.findMany({
      where: this.visibleWhere(studentId, id),
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }
  private project(r: Awaited<ReturnType<ReleasesService['visible']>>[number]) {
    if (r.sourceDigest !== workflowDigest(r.snapshot) || !r.publishedAt) throw workflowConflict();
    const s = z
      .object({
        usage: z.literal('SYNTHETIC_ONLY'),
        resultId: z.uuid(),
        registrationId: z.uuid(),
        examination: z.string(),
        attemptNumber: z.number(),
        periodNumber: z.number(),
        sgpa: z.string().nullable(),
        outcome: z.string(),
        subjects: syntheticPublishedResultSchema.shape.subjects,
      })
      .parse(r.snapshot);
    if (s.registrationId !== r.registrationId || s.resultId !== r.resultId)
      throw workflowConflict();
    return syntheticPublishedResultSchema.parse({
      id: r.id,
      ...s,
      label: 'SAMPLE — not an official result',
      publishedAt: r.publishedAt.toISOString(),
    });
  }
  async list(studentId: string, q: StudentResultsQuery) {
    if (!this.policy.enabled())
      return studentResultsPageSchema.parse({
        publicationAvailable: false,
        data: [],
        meta: { page: q.page, pageSize: q.pageSize, total: 0, totalPages: 0 },
      });
    const [rows, total] = await Promise.all([
      this.visible(studentId, undefined, q.page, q.pageSize),
      this.prisma.client.syntheticRelease.count({ where: this.visibleWhere(studentId) }),
    ]);
    return studentResultsPageSchema.parse({
      publicationAvailable: false,
      data: rows.map((r) => this.project(r)),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
      },
    });
  }
  async get(studentId: string, id: string) {
    if (!this.policy.enabled()) throw Errors.notFound();
    const r = (await this.visible(studentId, id))[0];
    if (!r) throw Errors.notFound();
    return this.project(r);
  }
}
