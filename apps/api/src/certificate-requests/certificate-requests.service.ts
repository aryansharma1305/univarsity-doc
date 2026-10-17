import { Injectable, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type DatabaseModels } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  certificateRequestSchema,
  certificateRequestListSchema,
  certificateServiceListSchema,
  type CertificateRequestQuery,
  type SubmitCertificateRequest,
  type CertificateTransition,
  ERROR_CODES,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Errors, AppError } from '../common/app-error.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { CertificatePoliciesService } from './certificate-policies.service.js';
const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.validationFailed, message);
const active = ['SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'INFORMATION_PROVIDED'];
const types = [
  ['TRANSCRIPT', 'Transcript', 'A record of your academic studies.'],
  ['PROVISIONAL', 'Provisional certificate', 'A provisional qualification document.'],
  ['CHARACTER', 'Character certificate', 'A university character certificate.'],
  ['MIGRATION', 'Migration certificate', 'A document for transfer to another institution.'],
  [
    'COURSE_COMPLETION',
    'Course completion certificate',
    'Confirms completion of a specific short course. It is not a degree certificate.',
  ],
] as const;
const include = {
  student: { select: { fullName: true, registrations: { select: { registrationNumber: true } } } },
} as const;
type Row = DatabaseModels.CertificateRequestModel & {
  events?: DatabaseModels.CertificateRequestEventModel[];
  student?: { fullName: string; registrations: { registrationNumber: string }[] };
};
@Injectable()
export class CertificateRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policies: CertificatePoliciesService,
    private readonly limiter: RateLimiter,
  ) {}
  async throttle(id: string) {
    const r = await this.limiter.hit(
      'certificate-request-write',
      [{ key: `principal:${id}`, limit: 30 }],
      60,
    );
    if (r.limited)
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.authRateLimited,
        'Too many certificate request actions. Please wait before trying again.',
        { headers: { 'Retry-After': String(r.retryAfterSeconds) } },
      );
  }
  catalogue() {
    return certificateServiceListSchema.parse({
      data: types.map(([certificateType, title, description]) => {
        const p = this.policies.get(certificateType);
        return {
          certificateType,
          title,
          description,
          available: !!p,
          reason: p
            ? 'Applications are available under the configured policy.'
            : 'Not available for applications yet. Approved eligibility, evidence and fee policies are pending.',
          purposeRequired: p?.fields.purposeRequired ?? false,
          remarksAllowed: p?.fields.remarksAllowed ?? false,
          policyId: p?.id ?? null,
          policyVersion: p?.version ?? null,
        };
      }),
      corrections: {
        available: false,
        reason:
          'Correction applications are not available yet. Issued-certificate identity, eligibility and Finance rules require approval.',
      },
    });
  }
  private output(r: Row, staff: boolean) {
    const p = this.policies.get(r.certificateType);
    const policyCurrent = p?.id === r.policyId && p.version === r.policyVersion;
    const canRespond =
      policyCurrent && p.actions.includes('RESPOND') && r.status === 'INFORMATION_REQUESTED';
    const canCancel = policyCurrent && p.actions.includes('CANCEL') && active.includes(r.status);
    const next: Record<string, string> = {
      SUBMITTED: 'Waiting for staff review.',
      UNDER_REVIEW: 'Staff are reviewing your application.',
      INFORMATION_REQUESTED: canRespond
        ? 'Provide the information requested below.'
        : 'Information requested. Follow-up policy is currently unavailable.',
      INFORMATION_PROVIDED: 'Your response is waiting for staff review.',
      REVIEW_COMPLETED: 'Staff review completed. Rector approval and issuance are not available.',
      CANCELLED: 'This application has been cancelled.',
      CLOSED: 'This application is closed.',
    };
    return certificateRequestSchema.parse({
      id: r.id,
      reference: r.reference,
      certificateType: r.certificateType,
      status: r.status,
      version: r.version,
      purpose: r.purpose,
      remarks: r.remarks,
      submittedAt: r.submittedAt.toISOString(),
      policyId: r.policyId,
      policyVersion: r.policyVersion,
      paymentStatus: 'NOT_AVAILABLE',
      approvalStatus: 'NOT_AVAILABLE',
      issuanceStatus: 'NOT_AVAILABLE',
      nextAction: next[r.status],
      canRespond,
      canCancel,
      canReview: staff && active.includes(r.status),
      canCompleteReview:
        staff &&
        this.policies.canComplete(r.certificateType) &&
        ['UNDER_REVIEW', 'INFORMATION_PROVIDED'].includes(r.status),
      ...(staff && r.student
        ? {
            student: {
              name: r.student.fullName,
              registrations: r.student.registrations.map((v) => v.registrationNumber),
            },
          }
        : {}),
      ...(r.events
        ? {
            events: r.events
              .filter((e) => staff || e.action !== 'RECORD_REVIEW')
              .map((e) => ({
                id: e.id,
                version: e.version,
                status: e.status,
                action: e.action,
                studentMessage: e.studentMessage,
                createdAt: e.createdAt.toISOString(),
                ...(staff ? { privateNote: e.privateNote } : {}),
              })),
          }
        : {}),
    });
  }
  async list(q: CertificateRequestQuery, studentId?: string) {
    if (studentId && q.search)
      throw Errors.validation([
        { path: 'search', message: 'Student identity search is not supported.' },
      ]);
    const scope: Prisma.CertificateRequestWhereInput = studentId ? { studentId } : {};
    const where: Prisma.CertificateRequestWhereInput = {
      ...scope,
      ...(q.status ? { status: q.status } : {}),
      ...(q.certificateType ? { certificateType: q.certificateType } : {}),
      ...(q.search
        ? {
            OR: [
              { reference: { contains: q.search, mode: 'insensitive' } },
              { student: { fullName: { contains: q.search, mode: 'insensitive' } } },
              {
                student: {
                  registrations: {
                    some: { registrationNumber: { contains: q.search, mode: 'insensitive' } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total, groups] = await this.prisma.client.$transaction([
      this.prisma.client.certificateRequest.findMany({
        where,
        include,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.client.certificateRequest.count({ where }),
      this.prisma.client.certificateRequest.groupBy({ by: ['status'], where: scope, _count: true }),
    ]);
    const counts = Object.fromEntries(
      [
        'SUBMITTED',
        'UNDER_REVIEW',
        'INFORMATION_REQUESTED',
        'INFORMATION_PROVIDED',
        'REVIEW_COMPLETED',
        'CANCELLED',
        'CLOSED',
      ].map((s) => [s, groups.find((g) => g.status === s)?._count ?? 0]),
    );
    return certificateRequestListSchema.parse({
      data: rows.map((r) => this.output(r, !studentId)),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
      },
      counts,
    });
  }
  async detail(id: string, studentId?: string) {
    const r = await this.prisma.client.certificateRequest.findFirst({
      where: { id, ...(studentId ? { studentId } : {}) },
      include: { ...include, events: { orderBy: { version: 'asc' } } },
    });
    if (!r) throw Errors.notFound();
    return this.output(r, !studentId);
  }
  async submit(studentId: string, body: SubmitCertificateRequest) {
    await this.throttle(studentId);
    const policy = this.policies.get(body.certificateType);
    if (!policy)
      throw conflict('Certificate applications are not available under an approved policy.');
    if (policy.fields.purposeRequired && !body.purpose.trim())
      throw Errors.validation([{ path: 'purpose', message: 'Purpose is required.' }]);
    if (!policy.fields.remarksAllowed && body.remarks)
      throw Errors.validation([
        { path: 'remarks', message: 'Remarks are not permitted by this policy.' },
      ]);
    const replay = async () => {
      const existing = await this.prisma.client.certificateRequest.findUnique({
        where: { studentId_submissionKey: { studentId, submissionKey: body.submissionKey } },
      });
      if (!existing) return null;
      if (
        existing.certificateType !== body.certificateType ||
        existing.purpose !== body.purpose ||
        existing.remarks !== (body.remarks ?? null)
      )
        throw conflict('This submission reference was already used for a different application.');
      return this.detail(existing.id, studentId);
    };
    const old = await replay();
    if (old) return old;
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        const r = await tx.certificateRequest.create({
          data: {
            studentId,
            reference: `CR-${randomUUID().toUpperCase()}`,
            certificateType: body.certificateType,
            policyId: policy.id,
            policyVersion: policy.version,
            policySnapshot: policy,
            purpose: body.purpose,
            remarks: body.remarks,
            submissionKey: body.submissionKey,
            events: {
              create: {
                version: 1,
                status: 'SUBMITTED',
                action: 'SUBMIT',
                actorStudentId: studentId,
              },
            },
          },
        });
        await this.audit.writeAuditEvent(
          {
            action: AUDIT_ACTIONS.certificateRequestSubmitted,
            entityType: 'CertificateRequest',
            entityId: r.id,
            metadata: {
              studentId,
              certificateType: r.certificateType,
              policyId: policy.id,
              policyVersion: policy.version,
            },
          },
          tx,
        );
        return r.id;
      });
      return await this.detail(id, studentId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const r = await replay();
        if (r) return r;
        throw conflict('An open application already exists for this certificate type.');
      }
      throw e;
    }
  }
  async transition(
    id: string,
    action:
      'REQUEST_INFORMATION' | 'RECORD_REVIEW' | 'COMPLETE_REVIEW' | 'RESPOND' | 'CANCEL' | 'CLOSE',
    body: CertificateTransition,
    actor: { studentId: string } | { userId: string },
  ) {
    const student = 'studentId' in actor;
    await this.throttle(student ? actor.studentId : actor.userId);
    await this.prisma.client.$transaction(async (tx) => {
      const r = await tx.certificateRequest.findFirst({
        where: { id, ...(student ? { studentId: actor.studentId } : {}) },
      });
      if (!r) throw Errors.notFound();
      if (r.version !== body.version)
        throw conflict('This application changed. Refresh before trying again.');
      if (student) {
        const p = this.policies.get(r.certificateType);
        if (
          p?.id !== r.policyId ||
          p.version !== r.policyVersion ||
          !p.actions.includes(action === 'RESPOND' ? 'RESPOND' : 'CANCEL')
        )
          throw conflict('Follow-up actions are unavailable under the current policy.');
      }
      let target: string;
      if (
        action === 'REQUEST_INFORMATION' &&
        !student &&
        ['SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_PROVIDED'].includes(r.status) &&
        body.message
      )
        target = 'INFORMATION_REQUESTED';
      else if (
        action === 'RECORD_REVIEW' &&
        !student &&
        ['SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_PROVIDED'].includes(r.status) &&
        body.privateNote
      )
        target = 'UNDER_REVIEW';
      else if (
        action === 'RESPOND' &&
        student &&
        r.status === 'INFORMATION_REQUESTED' &&
        body.message
      )
        target = 'INFORMATION_PROVIDED';
      else if (action === 'CANCEL' && student && active.includes(r.status)) target = 'CANCELLED';
      else if (
        action === 'COMPLETE_REVIEW' &&
        !student &&
        this.policies.canComplete(r.certificateType) &&
        ['UNDER_REVIEW', 'INFORMATION_PROVIDED'].includes(r.status)
      )
        target = 'REVIEW_COMPLETED';
      else if (
        action === 'CLOSE' &&
        !student &&
        ['REVIEW_COMPLETED', 'CANCELLED'].includes(r.status)
      )
        target = 'CLOSED';
      else
        throw conflict(
          'This transition is unavailable. Review completion requires an approved staff review policy; approval and issuance remain disabled.',
        );
      const changed = await tx.certificateRequest.updateMany({
        where: { id, version: r.version, status: r.status },
        data: { status: target, version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw conflict('This application changed. Refresh before trying again.');
      await tx.certificateRequestEvent.create({
        data: {
          requestId: id,
          version: r.version + 1,
          status: target,
          action,
          studentMessage: action === 'RECORD_REVIEW' ? null : body.message,
          privateNote: student ? undefined : body.privateNote,
          ...(student ? { actorStudentId: actor.studentId } : { actorUserId: actor.userId }),
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: student ? undefined : actor.userId,
          action: AUDIT_ACTIONS.certificateRequestTransitioned,
          entityType: 'CertificateRequest',
          entityId: id,
          metadata: { action, from: r.status, to: target, version: r.version + 1 },
        },
        tx,
      );
    });
    return this.detail(id, student ? actor.studentId : undefined);
  }
}
