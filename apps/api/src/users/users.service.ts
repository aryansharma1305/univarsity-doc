import { Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import { AuditService } from '../audit/audit.service.js';
import { SessionStore } from '../auth/session.store.js';
import { PasswordResetStore } from '../auth/password-reset.store.js';
import { PrismaService } from '../database/prisma.service.js';
import { Errors } from '../common/app-error.js';

export interface UserForAuth {
  id: string;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'DISABLED';
  passwordHash: string | null;
  roles: string[];
  /** A new password must be chosen before the account can do anything else. */
  passwordChangeRequired: boolean;
  /** A confirmed authenticator app exists (the TOTP secret itself is never part of this shape). */
  mfaEnabled: boolean;
  /**
   * When the authenticator was confirmed (null = no MFA). Part of every staff session's credential
   * binding (SessionStore.credentialVersion): changing it ends sessions bound to the previous value.
   */
  mfaEnabledAt: Date | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionStore,
    private readonly audit: AuditService,
    private readonly resets: PasswordResetStore,
  ) {}

  async findForAuthByEmail(email: string): Promise<UserForAuth | null> {
    return this.load({ email });
  }

  async findForAuthById(id: string): Promise<UserForAuth | null> {
    return this.load({ id });
  }

  /**
   * Replaces the password hash. With `expectedPasswordHash` the update is a compare-and-set that only
   * succeeds for an ACTIVE user still holding that hash. Choosing one's own password always clears
   * the first-login / access-reset `passwordChangeRequired` flag.
   */
  async setPasswordHash(
    userId: string,
    passwordHash: string,
    expectedPasswordHash?: string | null,
    /** When given, the write also requires this MFA state (compare-and-set; null = no MFA). */
    expectedMfaEnabledAt?: Date | null,
  ): Promise<void> {
    const data = { passwordHash, passwordChangeRequired: false };
    if (expectedPasswordHash !== undefined) {
      const updated = await this.prisma.client.user.updateMany({
        where: {
          id: userId,
          passwordHash: expectedPasswordHash,
          status: 'ACTIVE',
          ...(expectedMfaEnabledAt !== undefined ? { mfaEnabledAt: expectedMfaEnabledAt } : {}),
        },
        data,
      });
      if (updated.count !== 1) throw Errors.invalidCredentials();
      return;
    }
    await this.prisma.client.user.update({ where: { id: userId }, data });
  }

  /**
   * Revokes access without deleting the user: marks the account DISABLED and ends every session; the
   * status change and its audit entry commit together. Sessions are revoked inside the transaction
   * (before the audit entry, so it records the count); if the transaction then failed, ending sessions
   * early is harmless. The AuthGuard also reloads the user on every request and refuses (and revokes)
   * sessions of a DISABLED account.
   */
  async disableUser(
    userId: string,
    actorUserId: string | null,
    reason: string,
    options: {
      /** Runs first inside the same transaction (locks + invariant checks); throw to refuse. */
      beforeDisable?: (tx: Prisma.TransactionClient) => Promise<void>;
    } = {},
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await options.beforeDisable?.(tx);
      await tx.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
      const revoked = await this.sessions.revokeAllForUser(userId);
      // A reset link issued earlier must not survive the disable (or a later re-enable).
      await this.resets.revokeForUser(userId);
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.userDisabled,
          entityType: 'User',
          entityId: userId,
          metadata: { reason, sessionsRevoked: revoked },
        },
        tx,
      );
    });
  }

  private async load(where: { email: string } | { id: string }): Promise<UserForAuth | null> {
    const user = await this.prisma.client.user.findUnique({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        passwordHash: true,
        passwordChangeRequired: true,
        mfaEnabledAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      passwordHash: user.passwordHash,
      roles: user.roles.map((link) => link.role.name).sort(),
      passwordChangeRequired: user.passwordChangeRequired,
      mfaEnabled: user.mfaEnabledAt !== null,
      mfaEnabledAt: user.mfaEnabledAt,
    };
  }
}
