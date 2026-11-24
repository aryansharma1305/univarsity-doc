import { Injectable } from '@nestjs/common';
import { ACADEMIC_AUDIT_ACTIONS, PERMISSIONS, type Permission } from '@docversity/types';
import type { Dashboard, DashboardQuery } from '@docversity/validation';
import { Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { summarizeAudit } from './activity.js';

/** Certificate request states waiting on staff (INFORMATION_REQUESTED waits on the student). */
const CERTIFICATE_REQUEST_STAFF_STATES = ['SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_PROVIDED'];

/**
 * Real counts only — nothing on the dashboard is estimated, cached or invented. Each workload count
 * is computed only when the user holds that queue's read permission; otherwise it is null.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    permissions: ReadonlySet<Permission>,
    userId: string,
    query: DashboardQuery = {},
  ): Promise<Dashboard> {
    const db = this.prisma.client;
    const can = (permission: Permission) => permissions.has(permission);
    const when = (permission: Permission, run: () => Promise<number>) =>
      can(permission) ? run() : Promise.resolve(null);
    const thread = db.messageThread.fields;
    const sessionId = query.academicSessionId ?? null;
    const academicSession = sessionId
      ? await db.academicSession.findUnique({
          where: { id: sessionId },
          select: { id: true, code: true, name: true, status: true },
        })
      : null;
    if (sessionId && !academicSession) throw Errors.notFound();
    // Session-linked records are limited through their registration; the rest stay global.
    const inSession = sessionId ? { academicSessionId: sessionId } : {};
    const viaRegistration = sessionId ? { studentRegistration: inSession } : {};

    const [
      [students, activeRegistrations, programs, academicSessions],
      recentActivity,
      profileRequestsPending,
      certificateRequestsAwaitingStaff,
      reExamApplicationsPending,
      reExamPaymentsPending,
      resultsDraft,
      resultsUnderReview,
      resultsPublished,
      resultsWithheld,
      documentsAwaitingApproval,
      documentsIssued,
      admissionLettersIssued,
      messagesAwaitingReply,
      verificationQueriesOpen,
      unreadNotifications,
      enrolment,
    ] = await Promise.all([
      db.$transaction([
        db.student.count({ where: sessionId ? { registrations: { some: inSession } } : {} }),
        db.studentRegistration.count({ where: { status: 'ACTIVE', ...inSession } }),
        db.program.count({
          where: { status: 'ACTIVE', ...(sessionId ? { registrations: { some: inSession } } : {}) },
        }),
        db.academicSession.count(),
      ]),
      can(PERMISSIONS.auditRead)
        ? db.auditLog
            .findMany({
              where: { action: { in: [...ACADEMIC_AUDIT_ACTIONS] } },
              include: { actor: { select: { displayName: true } } },
              orderBy: { createdAt: 'desc' },
              take: 10,
            })
            .then((rows) => rows.map(summarizeAudit))
        : Promise.resolve(null),
      when(PERMISSIONS.studentProfileRequestsRead, () =>
        db.studentProfileChangeRequest.count({ where: { status: 'PENDING' } }),
      ),
      when(PERMISSIONS.certificateRequestsRead, () =>
        db.certificateRequest.count({
          where: { status: { in: CERTIFICATE_REQUEST_STAFF_STATES } },
        }),
      ),
      when(PERMISSIONS.reExamApplicationsRead, () =>
        db.reExamApplication.count({
          where: { status: 'SUBMITTED', ...(sessionId ? { registration: inSession } : {}) },
        }),
      ),
      when(PERMISSIONS.reExamPaymentsRead, () =>
        db.reExamPayment.count({
          where: {
            status: 'SUBMITTED',
            ...(sessionId ? { application: { registration: inSession } } : {}),
          },
        }),
      ),
      when(PERMISSIONS.resultsRead, () =>
        db.result.count({ where: { publicationStatus: 'DRAFT', ...viaRegistration } }),
      ),
      when(PERMISSIONS.resultsRead, () =>
        db.result.count({ where: { publicationStatus: 'UNDER_REVIEW', ...viaRegistration } }),
      ),
      // Withdrawal keeps the publication row and marks the result WITHHELD.
      when(PERMISSIONS.resultsRead, () =>
        db.result.count({
          where: {
            publicationStatus: 'PUBLISHED',
            officialPublication: { isNot: null },
            ...viaRegistration,
          },
        }),
      ),
      when(PERMISSIONS.resultsRead, () =>
        db.result.count({ where: { publicationStatus: 'WITHHELD', ...viaRegistration } }),
      ),
      when(PERMISSIONS.certificatesRead, () =>
        db.certificate.count({ where: { status: 'PENDING_APPROVAL', ...viaRegistration } }),
      ),
      when(PERMISSIONS.certificatesRead, () =>
        db.certificate.count({ where: { status: 'ISSUED', ...viaRegistration } }),
      ),
      when(PERMISSIONS.certificatesRead, () =>
        db.certificate.count({
          where: { status: 'ISSUED', documentType: 'ADMISSION_LETTER', ...viaRegistration },
        }),
      ),
      // Same "unread by the staff inbox" rule as the shared inbox's unread filter.
      when(PERMISSIONS.studentMessagesRead, () =>
        db.messageThread.count({
          where: {
            status: 'OPEN',
            OR: [{ staffReadAt: null }, { lastMessageAt: { gt: thread.staffReadAt } }],
          },
        }),
      ),
      when(PERMISSIONS.verificationQueriesRead, () =>
        db.verificationQuery.count({ where: { status: 'OPEN' } }),
      ),
      db.notification.count({ where: { userId, readAt: null } }),
      can(PERMISSIONS.registrationsRead) ? this.enrolment(sessionId) : Promise.resolve(null),
    ]);

    return {
      academicSession,
      counts: { students, activeRegistrations, programs, academicSessions },
      recentActivity,
      workload: {
        profileRequestsPending,
        certificateRequestsAwaitingStaff,
        reExamApplicationsPending,
        reExamPaymentsPending,
        resultsDraft,
        resultsUnderReview,
        resultsPublished,
        resultsWithheld,
        documentsAwaitingApproval,
        documentsIssued,
        admissionLettersIssued,
        messagesAwaitingReply,
        verificationQueriesOpen,
        unreadNotifications,
      },
      enrolment,
    };
  }

  /** Active registrations per course (optionally within one session) and per session. */
  private async enrolment(academicSessionId: string | null) {
    const db = this.prisma.client;
    const [byProgram, bySession] = await Promise.all([
      db.studentRegistration.groupBy({
        by: ['programId'],
        where: { status: 'ACTIVE', ...(academicSessionId ? { academicSessionId } : {}) },
        _count: { _all: true },
      }),
      db.studentRegistration.groupBy({
        by: ['academicSessionId'],
        where: { status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ]);
    const [programs, sessions] = await Promise.all([
      db.program.findMany({
        where: { id: { in: byProgram.map((row) => row.programId) } },
        select: { id: true, code: true, name: true },
      }),
      db.academicSession.findMany({
        where: { id: { in: bySession.map((row) => row.academicSessionId) } },
        select: { id: true, code: true, name: true },
      }),
    ]);
    const rows = <T extends { id: string; code: string; name: string }>(
      records: T[],
      counts: Map<string, number>,
    ) =>
      records
        .map((record) => ({ ...record, activeRegistrations: counts.get(record.id) ?? 0 }))
        .sort(
          (a, b) => b.activeRegistrations - a.activeRegistrations || a.code.localeCompare(b.code),
        );
    return {
      academicSessionId,
      byProgram: rows(programs, new Map(byProgram.map((r) => [r.programId, r._count._all]))),
      bySession: rows(
        sessions,
        new Map(bySession.map((r) => [r.academicSessionId, r._count._all])),
      ),
    };
  }
}
