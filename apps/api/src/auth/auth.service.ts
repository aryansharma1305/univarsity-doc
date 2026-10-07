import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS, permissionsForRoles } from '@docversity/types';
import {
  type AuthUser,
  type ChangePasswordRequest,
  ERROR_CODES,
  type LoginRequest,
  passwordPolicyViolations,
  type ResetPasswordRequest,
  type SessionSummary,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { UsersService, type UserForAuth } from '../users/users.service.js';
import type { AuthContext } from './auth.decorators.js';
import { summariseUserAgent } from './device-summary.js';
import { IdentifierHasher } from './identifier-hasher.js';
import { PASSWORD_RESET_NOTIFIER, type PasswordResetNotifier } from './password-reset.notifier.js';
import { PasswordResetStore } from './password-reset.store.js';
import { PasswordService } from './password.service.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionStore } from './session.store.js';

export interface ClientInfo {
  ip: string;
  userAgent: string | undefined;
  /** Session ID from an existing cookie, if any — revoked on login (session fixation defence). */
  existingSessionId: string | undefined;
}

const ONE_HOUR = 3_600;

@Injectable()
export class AuthService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionStore,
    private readonly rateLimiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
    private readonly audit: AuditService,
    private readonly resets: PasswordResetStore,
    @Inject(PASSWORD_RESET_NOTIFIER) private readonly resetNotifier: PasswordResetNotifier,
  ) {}

  /**
   * Verifies credentials and creates a new session. Every failure — unknown email, wrong password,
   * disabled account, missing password — produces the same AUTH_INVALID_CREDENTIALS response, and
   * unknown emails still pay the Argon2 cost, so neither the response nor its timing reveals which
   * accounts exist.
   */
  async login(
    input: LoginRequest,
    client: ClientInfo,
  ): Promise<{ sessionId: string; user: AuthUser }> {
    const emailHash = this.hasher.hash('email', input.email);
    const ipHash = this.hasher.hash('ip', client.ip);
    const pairKey = this.hasher.hash('email-ip', `${input.email}|${client.ip}`);
    const limit = await this.rateLimiter.hit(
      'login',
      [
        { key: `pair:${pairKey}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP },
        { key: `account:${emailHash}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT },
        { key: `ip:${ipHash}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_IP },
      ],
      this.config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (limit.limited) {
      if (limit.justExceeded) {
        // Audited once per window, not per throttled attempt, so an attack can't flood the audit log.
        await this.auditLoginFailure(null, 'rate_limited', emailHash, ipHash);
      }
      throw Errors.rateLimited(limit.retryAfterSeconds);
    }

    const user = await this.users.findForAuthByEmail(input.email);
    const passwordValid = user?.passwordHash
      ? await this.passwords.verifyPassword(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);

    if (!user || !passwordValid || user.status !== 'ACTIVE') {
      const reason = !user
        ? 'unknown_account'
        : !passwordValid
          ? 'invalid_password'
          : 'account_disabled';
      await this.auditLoginFailure(user?.id ?? null, reason, emailHash, ipHash);
      throw Errors.invalidCredentials();
    }

    await this.rateLimiter.clear('login', [`pair:${pairKey}`, `account:${emailHash}`]);
    if (client.existingSessionId) await this.sessions.revoke(client.existingSessionId);

    const device = summariseUserAgent(client.userAgent);
    const { sessionId, record } = await this.sessions.create({ userId: user.id, device, ipHash });
    await this.audit.writeAuditEvent({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.authLoginSuccess,
      entityType: 'User',
      entityId: user.id,
      metadata: { sessionHandle: record.publicId, device, ipHash },
    });
    return { sessionId, user: toAuthUser(user) };
  }

  async logout(auth: AuthContext | undefined): Promise<void> {
    if (!auth) return;
    await this.sessions.revoke(auth.sessionId);
    await this.audit.writeAuditEvent({
      actorUserId: auth.user.id,
      action: AUDIT_ACTIONS.authLogout,
      entityType: 'User',
      entityId: auth.user.id,
      metadata: { sessionHandle: auth.session.publicId },
    });
  }

  currentUser(auth: AuthContext): AuthUser {
    return {
      id: auth.user.id,
      email: auth.user.email,
      displayName: auth.user.displayName,
      roles: auth.user.roles,
      permissions: [...auth.user.permissions].sort(),
    };
  }

  async listSessions(auth: AuthContext): Promise<SessionSummary[]> {
    const currentHash = this.sessions.hashOf(auth.sessionId);
    const idleMs = this.config.SESSION_IDLE_TIMEOUT_SECONDS * 1000;
    return (await this.sessions.list(auth.user.id)).map(({ keyHash, record }) => ({
      id: record.publicId,
      createdAt: new Date(record.createdAt).toISOString(),
      lastSeenAt: new Date(record.lastSeenAt).toISOString(),
      expiresAt: new Date(
        Math.min(record.absoluteExpiresAt, record.lastSeenAt + idleMs),
      ).toISOString(),
      device: record.device,
      current: keyHash === currentHash,
    }));
  }

  /** Revokes one of the caller's own sessions. Returns whether it was the current session. */
  async revokeSession(auth: AuthContext, publicId: string): Promise<{ wasCurrent: boolean }> {
    const wasCurrent = publicId === auth.session.publicId;
    const revoked = await this.sessions.revokeByPublicId(auth.user.id, publicId);
    if (!revoked) throw Errors.notFound();
    await this.audit.writeAuditEvent({
      actorUserId: auth.user.id,
      action: AUDIT_ACTIONS.authSessionRevoked,
      entityType: 'User',
      entityId: auth.user.id,
      metadata: { sessionHandle: publicId, scope: 'single' },
    });
    return { wasCurrent };
  }

  /** Revokes all of the caller's sessions except the current one. */
  async revokeOtherSessions(auth: AuthContext): Promise<number> {
    const count = await this.sessions.revokeAllForUser(auth.user.id, {
      exceptSessionId: auth.sessionId,
    });
    await this.audit.writeAuditEvent({
      actorUserId: auth.user.id,
      action: AUDIT_ACTIONS.authSessionRevoked,
      entityType: 'User',
      entityId: auth.user.id,
      metadata: { scope: 'others', count },
    });
    return count;
  }

  /** Changes the caller's password; all of their other sessions are revoked. */
  async changePassword(auth: AuthContext, input: ChangePasswordRequest): Promise<void> {
    const limit = await this.rateLimiter.hit(
      'password-change',
      [{ key: `user:${auth.user.id}`, limit: 5 }],
      this.config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (limit.limited) throw Errors.rateLimited(limit.retryAfterSeconds);

    const user = await this.users.findForAuthById(auth.user.id);
    if (
      !user?.passwordHash ||
      !(await this.passwords.verifyPassword(user.passwordHash, input.currentPassword))
    ) {
      throw Errors.invalidCredentials();
    }
    assertPasswordPolicy(input.newPassword, user);
    await this.users.setPasswordHash(user.id, await this.passwords.hashPassword(input.newPassword));
    const revoked = await this.sessions.revokeAllForUser(user.id, {
      exceptSessionId: auth.sessionId,
    });
    await this.audit.writeAuditEvent({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.authPasswordChanged,
      entityType: 'User',
      entityId: user.id,
      metadata: { otherSessionsRevoked: revoked },
    });
  }

  /**
   * Starts a password reset. Answers identically whether or not the account exists. When email
   * delivery is not configured it refuses for EVERY address (503) rather than pretending to send.
   */
  async forgotPassword(email: string, ip: string): Promise<void> {
    if (!this.resetNotifier.isConfigured()) {
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.passwordResetUnavailable,
        'Password reset by email is not available. Contact a system administrator.',
      );
    }
    const emailHash = this.hasher.hash('email', email);
    const limit = await this.rateLimiter.hit(
      'password-reset',
      [
        { key: `account:${emailHash}`, limit: 3 },
        { key: `ip:${this.hasher.hash('ip', ip)}`, limit: 20 },
      ],
      ONE_HOUR,
    );
    if (limit.limited) throw Errors.rateLimited(limit.retryAfterSeconds);

    const user = await this.users.findForAuthByEmail(email);
    if (user?.status !== 'ACTIVE') return;

    const { token, expiresAt } = await this.resets.issue(user.id);
    // The token travels in the URL fragment, which browsers never send to servers or in Referer.
    const resetUrl = `${new URL(this.config.WEB_URL).origin}/admin/reset-password#token=${encodeURIComponent(token)}`;
    await this.resetNotifier.sendResetLink({
      email: user.email,
      displayName: user.displayName,
      resetUrl,
      expiresAt,
    });
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.authPasswordResetRequested,
      entityType: 'User',
      entityId: user.id,
      metadata: { expiresAt: expiresAt.toISOString() },
    });
  }

  /** Completes a reset: single-use token, policy check, new hash, ALL sessions revoked. */
  async resetPassword(input: ResetPasswordRequest): Promise<void> {
    const invalid = () =>
      new AppError(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.authInvalidResetToken,
        'This password reset link is invalid or has expired.',
      );
    const pendingUserId = await this.resets.peek(input.token);
    const user = pendingUserId ? await this.users.findForAuthById(pendingUserId) : null;
    if (user?.status !== 'ACTIVE') throw invalid();
    // Check the policy before consuming the token so a rejected password doesn't burn the link.
    assertPasswordPolicy(input.newPassword, user);
    if ((await this.resets.consume(input.token)) !== user.id) throw invalid();

    await this.users.setPasswordHash(user.id, await this.passwords.hashPassword(input.newPassword));
    const revoked = await this.sessions.revokeAllForUser(user.id);
    await this.audit.writeAuditEvent({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.authPasswordReset,
      entityType: 'User',
      entityId: user.id,
      metadata: { sessionsRevoked: revoked },
    });
  }

  private async auditLoginFailure(
    userId: string | null,
    reason: string,
    emailHash: string,
    ipHash: string,
  ): Promise<void> {
    // Never the password, never the raw email or IP — only keyed hashes for correlation.
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.authLoginFailure,
      entityType: 'User',
      entityId: userId,
      metadata: { reason, emailHash, ipHash },
    });
  }
}

export function toAuthUser(
  user: Pick<UserForAuth, 'id' | 'email' | 'displayName' | 'roles'>,
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    permissions: [...permissionsForRoles(user.roles)].sort(),
  };
}

function assertPasswordPolicy(
  password: string,
  user: Pick<UserForAuth, 'email' | 'displayName'>,
): void {
  const problems = passwordPolicyViolations(password, {
    email: user.email,
    displayName: user.displayName,
  });
  if (problems.length > 0) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ERROR_CODES.authPasswordPolicy,
      'Choose a stronger password.',
      {
        details: problems.map((problem) => ({
          path: 'newPassword',
          message: `Password ${problem}.`,
        })),
      },
    );
  }
}
