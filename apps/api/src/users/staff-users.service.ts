import { HttpStatus, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS, ROLE_NAMES } from '@docversity/types';
import {
  ERROR_CODES,
  passwordPolicyViolations,
  type StaffAccessResetRequest,
  type StaffUser,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { MfaService } from '../auth/mfa.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionStore } from '../auth/session.store.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { UsersService } from './users.service.js';

/**
 * SUPER_ADMIN staff-account administration (permission `users.manage`, which only SUPER_ADMIN holds):
 * list staff, reset another member's MFA + require a new password, and disable (retire) an account.
 * Every action is audited; every action ends the target's sessions. Nothing here returns or audits
 * a password, secret or recovery code.
 */
@Injectable()
export class StaffUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly sessions: SessionStore,
    private readonly passwords: PasswordService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<StaffUser[]> {
    const rows = await this.prisma.client.user.findMany({
      orderBy: { email: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        passwordChangeRequired: true,
        mfaEnabledAt: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      roles: row.roles.map((link) => link.role.name).sort(),
      status: row.status,
      mfaEnabled: row.mfaEnabledAt !== null,
      passwordChangeRequired: row.passwordChangeRequired,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Removes the target's authenticator and recovery codes, requires a new password at their next
   * sign-in (optionally replacing the password with a temporary one handed over out of band) and
   * revokes all their sessions. The change and its audit entry commit together.
   */
  async resetAccess(
    actorUserId: string,
    targetUserId: string,
    input: StaffAccessResetRequest,
  ): Promise<void> {
    if (actorUserId === targetUserId) {
      throw refused('Use your own account settings; another administrator must reset your access.');
    }
    const target = await this.users.findForAuthById(targetUserId);
    if (!target) throw Errors.notFound();
    let passwordHash: string | undefined;
    if (input.temporaryPassword !== undefined) {
      const problems = passwordPolicyViolations(input.temporaryPassword, {
        email: target.email,
        displayName: target.displayName,
      });
      if (problems.length > 0) {
        throw new AppError(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.authPasswordPolicy,
          'Choose a stronger temporary password.',
          {
            details: problems.map((problem) => ({
              path: 'temporaryPassword',
              message: `Password ${problem}.`,
            })),
          },
        );
      }
      passwordHash = await this.passwords.hashPassword(input.temporaryPassword);
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          mfaTotpSecretEnc: null,
          mfaTotpLastUsedStep: null,
          mfaEnabledAt: null,
          passwordChangeRequired: true,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      const codes = await tx.staffMfaRecoveryCode.deleteMany({ where: { userId: targetUserId } });
      const revoked = await this.sessions.revokeAllForUser(targetUserId);
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.staffAccessReset,
          entityType: 'User',
          entityId: targetUserId,
          metadata: {
            via: 'api',
            mfaWasEnabled: target.mfaEnabled,
            recoveryCodesRemoved: codes.count,
            temporaryLoginSet: passwordHash !== undefined,
            sessionsRevoked: revoked,
          },
        },
        tx,
      );
    });
    await this.mfa.discardEnrollment(targetUserId);
  }

  /** Disables (retires) another staff account and revokes all of its sessions. */
  async disable(actorUserId: string, targetUserId: string, reason: string): Promise<void> {
    if (actorUserId === targetUserId) throw refused('You cannot disable your own account.');
    const target = await this.users.findForAuthById(targetUserId);
    if (!target) throw Errors.notFound();
    if (target.status === 'DISABLED') throw refused('This account is already disabled.');
    if (target.roles.includes(ROLE_NAMES.superAdmin)) {
      const otherAdmins = await this.prisma.client.user.count({
        where: {
          id: { not: targetUserId },
          status: 'ACTIVE',
          roles: { some: { role: { name: ROLE_NAMES.superAdmin } } },
        },
      });
      if (otherAdmins === 0) throw refused('The last active SUPER_ADMIN cannot be disabled.');
    }
    await this.users.disableUser(targetUserId, actorUserId, reason);
  }
}

function refused(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
}
