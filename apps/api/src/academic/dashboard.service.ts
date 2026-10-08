import { Injectable } from '@nestjs/common';
import { ACADEMIC_AUDIT_ACTIONS } from '@docversity/types';
import type { Dashboard } from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { summarizeAudit } from './activity.js';

/** Real counts only — nothing on the dashboard is estimated, cached or invented. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(includeActivity: boolean): Promise<Dashboard> {
    const db = this.prisma.client;
    const [students, activeRegistrations, programs, academicSessions] = await db.$transaction([
      db.student.count(),
      db.studentRegistration.count({ where: { status: 'ACTIVE' } }),
      db.program.count({ where: { status: 'ACTIVE' } }),
      db.academicSession.count(),
    ]);
    const recentActivity = includeActivity
      ? (
          await db.auditLog.findMany({
            where: { action: { in: [...ACADEMIC_AUDIT_ACTIONS] } },
            include: { actor: { select: { displayName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        ).map(summarizeAudit)
      : null;
    return {
      counts: { students, activeRegistrations, programs, academicSessions },
      recentActivity,
    };
  }
}
