import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS, ROLE_DESCRIPTIONS, ROLE_NAMES, type RoleName } from '@docversity/types';
import {
  ERROR_CODES,
  passwordPolicyViolations,
  type StaffAccessResetRequest,
  type StaffCreateRequest,
  type StaffUser,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { MfaService } from '../auth/mfa.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionStore } from '../auth/session.store.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { UsersService } from './users.service.js';

/** Serialises every change that could remove the last active SUPER_ADMIN. */
const SUPER_ADMIN_LOCK = 'staff-users:last-super-admin';

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
   * Creates a staff account with explicit roles. The temporary password must be changed at first
   * sign-in and is never returned or audited. Duplicate emails are refused.
   */
  async create(actorUserId: string, input: StaffCreateRequest): Promise<StaffUser> {
    this.checkPassword(input.temporaryPassword, input.email, input.displayName);
    const passwordHash = await this.passwords.hashPassword(input.temporaryPassword);
    const id = await this.prisma.client.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } }))
        throw new AppError(
          HttpStatus.CONFLICT,
          ERROR_CODES.conflict,
          'A staff account with this email already exists.',
          { details: [{ path: 'email', message: 'This email is already in use.' }] },
        );
      const roleIds = await this.roleIds(tx, input.roles);
      const user = await tx.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          passwordChangeRequired: true,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.adminCreated,
          entityType: 'User',
          entityId: user.id,
          metadata: { via: 'api', roles: [...input.roles].sort(), passwordChangeRequired: true },
        },
        tx,
      );
      return user.id;
    });
    return this.one(id);
  }

  /**
   * Replaces another staff member's roles. Your own roles cannot be changed (no self-escalation or
   * self-lockout); removing SUPER_ADMIN from the last active SUPER_ADMIN is refused under the same
   * lock as disabling. Permissions are re-read on every request, so the change applies at once.
   */
  async setRoles(actorUserId: string, targetUserId: string, roles: RoleName[]): Promise<StaffUser> {
    if (actorUserId === targetUserId)
      throw refused('Your own roles can only be changed by another SUPER_ADMIN.');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${SUPER_ADMIN_LOCK}, 0))`;
      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { status: true, roles: { select: { role: { select: { name: true } } } } },
      });
      if (!target) throw Errors.notFound();
      const before = target.roles.map((link) => link.role.name).sort();
      const after = [...roles].sort();
      if (before.join() === after.join()) return;
      if (
        target.status === 'ACTIVE' &&
        before.includes(ROLE_NAMES.superAdmin) &&
        !after.includes(ROLE_NAMES.superAdmin) &&
        (await this.otherActiveSuperAdmins(tx, targetUserId)) === 0
      )
        throw refused('The last active SUPER_ADMIN must keep the SUPER_ADMIN role.');
      const roleIds = await this.roleIds(tx, roles);
      await tx.userRole.deleteMany({ where: { userId: targetUserId } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: targetUserId, roleId })),
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.staffRolesChanged,
          entityType: 'User',
          entityId: targetUserId,
          metadata: { before, after },
        },
        tx,
      );
    });
    return this.one(targetUserId);
  }

  /**
   * Re-enables a disabled account with a new temporary password (changed at next sign-in) and no
   * authenticator, so whoever held the old credentials cannot sign in.
   */
  async enable(
    actorUserId: string,
    targetUserId: string,
    temporaryPassword: string,
  ): Promise<StaffUser> {
    if (actorUserId === targetUserId) throw refused('You cannot re-enable your own account.');
    const target = await this.users.findForAuthById(targetUserId);
    if (!target) throw Errors.notFound();
    this.checkPassword(temporaryPassword, target.email, target.displayName);
    const passwordHash = await this.passwords.hashPassword(temporaryPassword);
    await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: targetUserId, status: 'DISABLED' },
        data: {
          status: 'ACTIVE',
          passwordHash,
          passwordChangeRequired: true,
          mfaTotpSecretEnc: null,
          mfaTotpLastUsedStep: null,
          mfaEnabledAt: null,
        },
      });
      if (changed.count === 0) throw refused('This account is not disabled.');
      const codes = await tx.staffMfaRecoveryCode.deleteMany({ where: { userId: targetUserId } });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.userEnabled,
          entityType: 'User',
          entityId: targetUserId,
          metadata: { temporaryLoginSet: true, recoveryCodesRemoved: codes.count },
        },
        tx,
      );
    });
    await this.mfa.discardEnrollment(targetUserId);
    await this.mfa.clearLockout(targetUserId);
    return this.one(targetUserId);
  }

  private async one(id: string): Promise<StaffUser> {
    const user = (await this.list()).find((row) => row.id === id);
    if (!user) throw Errors.notFound();
    return user;
  }

  private checkPassword(password: string, email: string, displayName: string) {
    const problems = passwordPolicyViolations(password, { email, displayName });
    if (problems.length > 0)
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

  /** Role rows for code-defined role names, creating any missing record (never other roles). */
  private async roleIds(tx: Prisma.TransactionClient, roles: RoleName[]) {
    await tx.role.createMany({
      data: roles.map((name) => ({ name, description: ROLE_DESCRIPTIONS[name] })),
      skipDuplicates: true,
    });
    const rows = await tx.role.findMany({ where: { name: { in: roles } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  private otherActiveSuperAdmins(tx: Prisma.TransactionClient, userId: string) {
    return tx.user.count({
      where: {
        id: { not: userId },
        status: 'ACTIVE',
        roles: { some: { role: { name: ROLE_NAMES.superAdmin } } },
      },
    });
  }

  /**
   * Removes the target's authenticator and recovery codes, replaces the password with a REQUIRED
   * temporary one handed over out of band (so the password hash always changes and nobody who knew
   * the old password can sign in), requires a new password at their next sign-in, clears any MFA
   * lockout and revokes all their sessions. The change and its audit entry commit together.
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
    const passwordHash = await this.passwords.hashPassword(input.temporaryPassword);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          mfaTotpSecretEnc: null,
          mfaTotpLastUsedStep: null,
          mfaEnabledAt: null,
          passwordChangeRequired: true,
          passwordHash,
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
            temporaryLoginSet: true,
            sessionsRevoked: revoked,
          },
        },
        tx,
      );
    });
    await this.mfa.discardEnrollment(targetUserId);
    await this.mfa.clearLockout(targetUserId);
  }

  /**
   * Disables (retires) another staff account and revokes all of its sessions. The "last active
   * SUPER_ADMIN" check and the status change run in ONE transaction under a global advisory lock, so
   * two concurrent disables can never both pass the check and leave no active SUPER_ADMIN.
   */
  async disable(actorUserId: string, targetUserId: string, reason: string): Promise<void> {
    if (actorUserId === targetUserId) throw refused('You cannot disable your own account.');
    const exists = await this.users.findForAuthById(targetUserId);
    if (!exists) throw Errors.notFound();
    await this.users.disableUser(targetUserId, actorUserId, reason, {
      beforeDisable: async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${SUPER_ADMIN_LOCK}, 0))`;
        // Re-read under the lock: another transaction may have changed it since the request began.
        const target = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { status: true, roles: { select: { role: { select: { name: true } } } } },
        });
        if (!target) throw Errors.notFound();
        if (target.status === 'DISABLED') throw refused('This account is already disabled.');
        if (target.roles.some((link) => link.role.name === ROLE_NAMES.superAdmin)) {
          const otherAdmins = await tx.user.count({
            where: {
              id: { not: targetUserId },
              status: 'ACTIVE',
              roles: { some: { role: { name: ROLE_NAMES.superAdmin } } },
            },
          });
          if (otherAdmins === 0) throw refused('The last active SUPER_ADMIN cannot be disabled.');
        }
      },
    });
  }
}

function refused(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
}
