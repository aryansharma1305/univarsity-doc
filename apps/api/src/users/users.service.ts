import { Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import { AuditService } from '../audit/audit.service.js';
import { SessionStore } from '../auth/session.store.js';
import { PrismaService } from '../database/prisma.service.js';

export interface UserForAuth {
  id: string;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'DISABLED';
  passwordHash: string | null;
  roles: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionStore,
    private readonly audit: AuditService,
  ) {}

  async findForAuthByEmail(email: string): Promise<UserForAuth | null> {
    return this.load({ email });
  }

  async findForAuthById(id: string): Promise<UserForAuth | null> {
    return this.load({ id });
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.client.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /**
   * Revokes access without deleting the user: marks the account DISABLED and ends every session.
   * Future user-management endpoints call this.
   */
  async disableUser(userId: string, actorUserId: string | null, reason: string): Promise<void> {
    await this.prisma.client.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
    const revoked = await this.sessions.revokeAllForUser(userId);
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.userDisabled,
      entityType: 'User',
      entityId: userId,
      metadata: { reason, sessionsRevoked: revoked },
    });
  }

  private async load(where: { email: string } | { id: string }): Promise<UserForAuth | null> {
    const user = await this.prisma.client.user.findUnique({
      where,
      include: { roles: { include: { role: { select: { name: true } } } } },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      passwordHash: user.passwordHash,
      roles: user.roles.map((link) => link.role.name).sort(),
    };
  }
}
