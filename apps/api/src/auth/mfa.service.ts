import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type AuthUser,
  ERROR_CODES,
  type MfaEnrollmentConfirmRequest,
  type MfaEnrollmentConfirmResponse,
  type MfaEnrollmentStartResponse,
  type MfaVerifyRequest,
} from '@docversity/validation';
import QRCode from 'qrcode';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { withTimeout } from '../common/with-timeout.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { type UserForAuth, UsersService } from '../users/users.service.js';
import type { AuthContext } from './auth.decorators.js';
import { summariseUserAgent } from './device-summary.js';
import { IdentifierHasher } from './identifier-hasher.js';
import { generateRecoveryCodes, MfaCrypto } from './mfa-crypto.js';
import { PasswordService } from './password.service.js';
import { type LimitResult, type LimitRule, RateLimiter } from './rate-limiter.js';
import { type SessionRecord, SessionStore } from './session.store.js';
import { describeUser } from './auth-user.js';
import { staffNextStep } from './staff-steps.js';
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';

/** A pending-MFA session must be completed within this time, or the password step starts again. */
export const MFA_PENDING_SESSION_SECONDS = 300;
/** An unconfirmed enrollment secret lives this long (Redis, encrypted). */
const ENROLLMENT_TTL_SECONDS = 600;
const ISSUER = 'Docversity';
/**
 * How long one verify request holds the exclusive claim on its pending session. Long enough for a
 * normal request; the atomic GETDEL of the pending session remains the hard guarantee if it expires.
 */
const VERIFY_CLAIM_MS = 15_000;

export interface MfaClientInfo {
  ip: string;
  userAgent: string | undefined;
}

/**
 * Staff authenticator-app MFA (RFC 6238 TOTP): enrollment, the second sign-in step and recovery
 * codes. Secrets are encrypted at rest (MfaCrypto, STAFF_MFA_ENCRYPTION_KEY); recovery codes are stored
 * only as keyed hashes. Nothing here logs or audits a secret, code or recovery code.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly crypto: MfaCrypto | null;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
    private readonly sessions: SessionStore,
    private readonly rateLimiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {
    this.crypto = config.STAFF_MFA_ENCRYPTION_KEY
      ? new MfaCrypto(config.STAFF_MFA_ENCRYPTION_KEY)
      : null;
  }

  isAvailable(): boolean {
    return this.crypto !== null;
  }

  /** Starts (or restarts) enrollment: a new random secret, shown exactly once in this response. */
  async startEnrollment(auth: AuthContext): Promise<MfaEnrollmentStartResponse> {
    const crypto = this.requireCrypto();
    if (auth.mfaEnabled) throw mfaAlreadyEnabled();
    const secret = generateTotpSecret();
    const encoded = base32Encode(secret);
    const encrypted = crypto.encrypt(secret, auth.user.id, 'enrollment');
    await this.redisOp((redis) =>
      redis.set(this.enrollmentKey(auth.user.id), encrypted, 'EX', ENROLLMENT_TTL_SECONDS),
    );
    const uri = otpauthUri({ issuer: ISSUER, account: auth.user.email, secret: encoded });
    const svg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    return {
      secret: encoded,
      otpauthUri: uri,
      qrSvgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      expiresAt: new Date(Date.now() + ENROLLMENT_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Activates MFA after the user re-authenticates with their current password (Argon2, throttled like
   * sign-in) and a valid code proves the authenticator holds the secret. Issues fresh single-use
   * recovery codes (returned once), audits MFA_ENABLED in the same transaction as the change, then
   * replaces the current session with a NEW session ID and ends every other session.
   *
   * Order matters:
   * 1. The pending enrollment (encrypted secret in Redis) is loaded FIRST. Without a live 10-minute
   *    enrollment the request is refused with 400 before any throttle is consumed or any password is
   *    checked, so this endpoint is not a password oracle outside an enrollment the user started.
   * 2. Throttle (`mfa-enroll` scope AND the sign-in per-account `login` bucket), then the password.
   * 3. One DB transaction enables MFA and stores the recovery-code hashes. Nothing before it commits
   *    returns codes. Once it has committed, the codes are ALWAYS returned: every later step is
   *    best-effort (see finishEnrollment).
   */
  async confirmEnrollment(
    auth: AuthContext,
    input: MfaEnrollmentConfirmRequest,
    client: MfaClientInfo,
  ): Promise<{ sessionId: string | null; result: MfaEnrollmentConfirmResponse }> {
    const crypto = this.requireCrypto();
    const userId = auth.user.id;
    const ipHash = this.hasher.hash('ip', client.ip);

    const pending = await this.redisOp((redis) => redis.get(this.enrollmentKey(userId)));
    if (!pending) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.mfaEnrollmentExpired,
        'This setup has expired. Start again to get a new QR code.',
      );
    }

    await this.throttle('mfa-enroll', userId, client.ip);
    // Wrong current passwords also spend the account's SIGN-IN allowance (the same `login` bucket as
    // POST /auth/login), so a stolen session gets no separate password-guessing budget.
    await this.throttleSignInAccount(userId, auth.user.email);

    const user = await this.users.findForAuthById(userId);
    if (user?.status !== 'ACTIVE' || !user.passwordHash) throw Errors.sessionExpired();
    if (!(await this.passwords.verifyPassword(user.passwordHash, input.currentPassword))) {
      await this.audit.writeAuditEvent({
        actorUserId: userId,
        action: AUDIT_ACTIONS.authMfaFailure,
        entityType: 'User',
        entityId: userId,
        metadata: { stage: 'enrollment', reason: 'invalid_password', ipHash },
      });
      throw Errors.invalidCredentials();
    }

    let secret: Buffer;
    try {
      secret = crypto.decrypt(pending, userId, 'enrollment');
    } catch {
      throw Errors.authUnavailable();
    }
    const step = verifyTotp(secret, input.code, Date.now(), null);
    if (step === null) throw invalidCode();

    const recoveryCodes = generateRecoveryCodes();
    const enabledAt = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, status: 'ACTIVE', mfaEnabledAt: null },
        data: {
          mfaTotpSecretEnc: crypto.encrypt(secret, userId, 'secret'),
          mfaTotpLastUsedStep: BigInt(step),
          mfaEnabledAt: enabledAt,
        },
      });
      if (updated.count !== 1) throw mfaAlreadyEnabled();
      await tx.staffMfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.staffMfaRecoveryCode.createMany({
        data: recoveryCodes.map((item) => ({
          userId,
          codeHash: crypto.hashRecoveryCode(userId, item.normalised),
        })),
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: userId,
          action: AUDIT_ACTIONS.mfaEnabled,
          entityType: 'User',
          entityId: userId,
          metadata: { method: 'totp', recoveryCodeCount: recoveryCodes.length },
        },
        tx,
      );
    });

    // MFA is now enabled: from here on nothing may throw, or the codes would be lost.
    const display = recoveryCodes.map((item) => item.display);
    const enrolled = {
      ...user,
      passwordHash: user.passwordHash,
      mfaEnabled: true,
      mfaEnabledAt: enabledAt,
    };
    const rotated = await this.finishEnrollment(auth, enrolled, client, ipHash);
    if (!rotated) {
      return {
        sessionId: null,
        result: { recoveryCodes: display, reauthenticate: true, user: null },
      };
    }
    return {
      sessionId: rotated.sessionId,
      result: { recoveryCodes: display, reauthenticate: false, user: rotated.user },
    };
  }

  /**
   * Everything after the MFA-enable transaction commits. Never throws: each step is best-effort and
   * a failure is logged (step names only, never secrets) and audited once as
   * MFA_ENROLLMENT_CLEANUP_INCOMPLETE.
   *
   * Session order (safe by construction):
   * 1. Revoke the CURRENT session first (atomic GETDEL). A new session is created only if that
   *    revocation succeeded and the session was still ours, so the old ID can never survive next to
   *    the rotated one.
   * 2. Create the rotated session. If this fails, no session exists: the client is told to sign in
   *    again (`reauthenticate: true`, cookie cleared) — with MFA, which the codes now back up.
   * 3. Revoke every other session (or all of them, if no rotated session exists). This also retries
   *    the removal of the old session if step 1 failed.
   * Independently of Redis, every session is bound to the account's MFA state (see
   * SessionStore.credentialVersion): sessions created while MFA was off — the un-rotated current
   * session, other sessions, and a password-only login racing this commit — stop matching from the
   * first request after the commit, even if every Redis step above failed. Only sessions bound to
   * this `mfa_enabled_at` (the rotated one, or later sign-ins that pass the second factor) work.
   * 4. Drop the enrollment secret, the MFA lockout history and the enrollment throttle counter.
   */
  private async finishEnrollment(
    auth: AuthContext,
    user: UserForAuth & { passwordHash: string },
    client: MfaClientInfo,
    ipHash: string,
  ): Promise<{ sessionId: string; user: AuthUser } | null> {
    const userId = user.id;
    const failed: string[] = [];
    const attempt = async <T>(
      name: string,
      operation: () => Promise<T>,
    ): Promise<T | undefined> => {
      try {
        return await operation();
      } catch {
        failed.push(name);
        return undefined;
      }
    };

    let rotated: { sessionId: string; record: SessionRecord } | undefined;
    const previous = await attempt('revoke_current_session', () =>
      this.sessions.revoke(auth.sessionId),
    );
    if (previous?.userId === userId && previous.stage === undefined) {
      rotated = await attempt('create_rotated_session', () =>
        this.sessions.create({
          userId,
          passwordHash: user.passwordHash,
          mfaEnabledAt: user.mfaEnabledAt,
          device: summariseUserAgent(client.userAgent),
          ipHash,
        }),
      );
    }
    await attempt('revoke_other_sessions', () =>
      this.sessions.revokeAllForUser(userId, rotated ? { exceptSessionId: rotated.sessionId } : {}),
    );
    await attempt('discard_enrollment', () => this.discardEnrollment(userId));
    // A new authenticator starts with a clean failure history (only reachable after an access reset).
    await attempt('clear_lockout', () => this.clearLockout(userId));
    await attempt('clear_enroll_throttle', () =>
      this.rateLimiter.clear('mfa-enroll', [this.pairKey(userId, client.ip)]),
    );

    if (failed.length > 0) {
      this.logger.warn({
        msg: 'MFA enrollment committed; post-commit cleanup incomplete',
        userId,
        failedSteps: failed,
        sessionRotated: rotated !== undefined,
      });
      await attempt('audit', () =>
        this.audit.writeAuditEvent({
          actorUserId: userId,
          action: AUDIT_ACTIONS.mfaEnrollmentCleanupIncomplete,
          entityType: 'User',
          entityId: userId,
          metadata: { failedSteps: failed, sessionRotated: rotated !== undefined, ipHash },
        }),
      );
    }
    if (!rotated) return null;
    return {
      sessionId: rotated.sessionId,
      user: describeUser(user, staffNextStep(rotated.record, user, this.config)),
    };
  }

  /**
   * Second sign-in step. Accepts a current authenticator code (±1 step, each step only once) or one
   * unused recovery code. On success the pending session is replaced by a NEW full session (fresh ID).
   */
  async verifyLogin(
    auth: AuthContext,
    input: MfaVerifyRequest,
    client: MfaClientInfo,
  ): Promise<{ sessionId: string; user: AuthUser }> {
    if (auth.session.stage !== 'mfa') {
      throw new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, 'No sign-in step is pending.');
    }
    const crypto = this.requireCrypto();
    const userId = auth.user.id;
    const ipHash = this.hasher.hash('ip', client.ip);
    await this.assertNotLocked(userId);
    const limit = await this.throttle('mfa', userId, client.ip);

    // Exclusive claim on this pending session BEFORE any code is spent: concurrent verifies of one
    // pending session cannot each burn a code, and at most one of them can turn it into a session.
    const claimKey = this.verifyClaimKey(auth.sessionId);
    const claimed = await this.redisOp((redis) =>
      redis.set(claimKey, '1', 'PX', VERIFY_CLAIM_MS, 'NX'),
    );
    if (claimed !== 'OK') {
      throw new AppError(
        HttpStatus.CONFLICT,
        ERROR_CODES.conflict,
        'This sign-in is already being verified.',
      );
    }

    const method = input.code !== undefined ? 'totp' : 'recovery_code';
    // The `mfa_enabled_at` of the authenticator the code was checked against (null = rejected).
    let accepted: Date | null;
    try {
      accepted =
        input.code !== undefined
          ? await this.consumeTotp(crypto, userId, input.code)
          : await this.consumeRecoveryCode(crypto, userId, input.recoveryCode ?? '');
    } catch (error) {
      await this.redisOp((redis) => redis.del(claimKey));
      throw error;
    }
    if (accepted === null) {
      // Release the claim so the user can retry on the same pending session (within the limits).
      await this.redisOp((redis) => redis.del(claimKey));
      await this.audit.writeAuditEvent({
        actorUserId: null,
        action: AUDIT_ACTIONS.authMfaFailure,
        entityType: 'User',
        entityId: userId,
        metadata: { method, reason: 'invalid_code', ipHash },
      });
      await this.recordFailure(userId);
      throw invalidCode();
    }

    const user = await this.users.findForAuthById(userId);
    if (user?.status !== 'ACTIVE' || !user.passwordHash) throw Errors.sessionExpired();
    // Consume the pending session atomically (GETDEL). If it is already gone (expired, revoked, or
    // consumed by a concurrent request), no full session is created.
    const consumed = await this.sessions.revoke(auth.sessionId);
    if (consumed?.userId !== userId || consumed.stage !== 'mfa') throw Errors.sessionExpired();
    // The pending session must still match the account as just read — the same password hash and the
    // authenticator that accepted the code — or a password change/reset or re-enrollment happened
    // during this request and no full session may be derived from it.
    if (!this.sessions.matchesCredential(consumed, user.passwordHash, accepted)) {
      throw Errors.sessionExpired();
    }
    const device = summariseUserAgent(client.userAgent);
    // Bound to the authenticator that accepted the code: if MFA was reset or re-enrolled meanwhile,
    // the new session does not match the account and the guard refuses it.
    const { sessionId, record } = await this.sessions.create({
      userId,
      passwordHash: user.passwordHash,
      mfaEnabledAt: accepted,
      device,
      ipHash,
    });
    // Only the per-account+IP counter is cleared; the per-account counter keeps running so a
    // success never refills the allowance for guesses from elsewhere.
    await this.rateLimiter.clear('mfa', [this.pairKey(userId, client.ip)]);
    // Shared campus NAT: a correct code gives back its per-IP unit, so that bucket counts wrong codes
    // only (spraying). The per-account counter and the lockout are untouched.
    await this.rateLimiter.refund('mfa', limit, [`ip:${ipHash}`]);
    // The claim is left to expire: a late concurrent request is refused before it can spend a code.
    await this.audit.writeAuditEvent({
      actorUserId: userId,
      action: AUDIT_ACTIONS.authMfaVerified,
      entityType: 'User',
      entityId: userId,
      metadata: { method, sessionHandle: record.publicId, device, ipHash },
    });
    return { sessionId, user: await this.currentUser(userId, record) };
  }

  /**
   * Clears the escalating MFA lockout and its failure history (SUPER_ADMIN access reset, or a newly
   * confirmed authenticator).
   */
  async clearLockout(userId: string): Promise<void> {
    await this.redisOp((redis) => redis.del(this.lockKey(userId), this.failureKey(userId)));
  }

  /** Drops an unconfirmed enrollment secret (e.g. after an administrator reset). */
  async discardEnrollment(userId: string): Promise<void> {
    await this.redisOp((redis) => redis.del(this.enrollmentKey(userId)));
  }

  /** Removes stale enrollment and lockout state together before a disabled account becomes active. */
  async clearEnrollmentAndLockout(userId: string): Promise<void> {
    await this.redisOp((redis) =>
      redis.del(this.enrollmentKey(userId), this.lockKey(userId), this.failureKey(userId)),
    );
  }

  /** The AuthUser view of a user (with the step their session still has to complete). */
  async currentUser(userId: string, record: { stage?: 'mfa' } | null): Promise<AuthUser> {
    const user = await this.users.findForAuthById(userId);
    if (!user) throw Errors.sessionExpired();
    const nextStep = staffNextStep(record ?? {}, user, this.config);
    return describeUser(user, nextStep);
  }

  /** Returns the `mfa_enabled_at` the code was verified against, or null if it was not accepted. */
  private async consumeTotp(crypto: MfaCrypto, userId: string, code: string): Promise<Date | null> {
    const row = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { mfaTotpSecretEnc: true, mfaTotpLastUsedStep: true, mfaEnabledAt: true },
    });
    if (!row?.mfaTotpSecretEnc || !row.mfaEnabledAt) return null;
    const enabledAt = row.mfaEnabledAt;
    let secret: Buffer;
    try {
      secret = crypto.decrypt(row.mfaTotpSecretEnc, userId, 'secret');
    } catch {
      // Wrong/rotated key or tampered row. Never reveal which; operators see the log line.
      this.logger.error({ msg: 'Staff MFA secret could not be decrypted', userId });
      throw Errors.authUnavailable();
    }
    const last = row.mfaTotpLastUsedStep === null ? null : Number(row.mfaTotpLastUsedStep);
    const step = verifyTotp(secret, code, Date.now(), last);
    if (step === null) return null;
    // Compare-and-set: a concurrent request with the same (or a later) step loses, and so does one
    // racing a reset/re-enrollment (the authenticator must still be the one that was read).
    const updated = await this.prisma.client.user.updateMany({
      where: {
        id: userId,
        mfaEnabledAt: enabledAt,
        OR: [{ mfaTotpLastUsedStep: null }, { mfaTotpLastUsedStep: { lt: BigInt(step) } }],
      },
      data: { mfaTotpLastUsedStep: BigInt(step) },
    });
    return updated.count === 1 ? enabledAt : null;
  }

  /** Returns the `mfa_enabled_at` the code belongs to, or null if it was not accepted. */
  private async consumeRecoveryCode(
    crypto: MfaCrypto,
    userId: string,
    normalised: string,
  ): Promise<Date | null> {
    const codeHash = crypto.hashRecoveryCode(userId, normalised);
    const owner = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { mfaEnabledAt: true },
    });
    const enabledAt = owner?.mfaEnabledAt ?? null;
    if (enabledAt === null) return null;
    return this.prisma.client.$transaction(async (tx) => {
      const spent = await tx.staffMfaRecoveryCode.updateMany({
        where: { userId, codeHash, usedAt: null, user: { mfaEnabledAt: enabledAt } },
        data: { usedAt: new Date() },
      });
      if (spent.count !== 1) return null;
      const remaining = await tx.staffMfaRecoveryCode.count({ where: { userId, usedAt: null } });
      await this.audit.writeAuditEvent(
        {
          actorUserId: userId,
          action: AUDIT_ACTIONS.mfaRecoveryCodeUsed,
          entityType: 'User',
          entityId: userId,
          metadata: { remaining },
        },
        tx,
      );
      return enabledAt;
    });
  }

  /**
   * Sign-in step (`mfa`): the dedicated, tighter MFA_* limits per user+IP, per user and per IP.
   * Enrollment confirmation (`mfa-enroll`, which checks the password): the sign-in LOGIN_* limits.
   * Counted before any password or code is compared; the first throttled attempt per window is audited.
   */
  private async throttle(
    scope: 'mfa' | 'mfa-enroll',
    userId: string,
    ip: string,
  ): Promise<LimitResult> {
    const c = this.config;
    const signIn = scope === 'mfa';
    const rules: LimitRule[] = [
      {
        key: this.pairKey(userId, ip),
        limit: signIn ? c.MFA_MAX_ATTEMPTS_PER_ACCOUNT_IP : c.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP,
      },
      {
        key: `account:${userId}`,
        limit: signIn ? c.MFA_MAX_ATTEMPTS_PER_ACCOUNT : c.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT,
      },
      {
        key: `ip:${this.hasher.hash('ip', ip)}`,
        limit: signIn ? c.MFA_MAX_ATTEMPTS_PER_IP : c.LOGIN_MAX_ATTEMPTS_PER_IP,
      },
      // Never refunded: caps successful verifies per address (the `ip` bucket counts failures only).
      ...(signIn
        ? [
            {
              key: `ip-total:${this.hasher.hash('ip', ip)}`,
              limit: c.LOGIN_MAX_TOTAL_ATTEMPTS_PER_IP,
            },
          ]
        : []),
    ];
    const limit = await this.rateLimiter.hit(
      scope,
      rules,
      signIn ? c.MFA_RATE_LIMIT_WINDOW_SECONDS : c.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!limit.limited) return limit;
    if (limit.justExceeded) {
      // Once per window, like password sign-in, so an attack cannot flood the audit log.
      await this.audit.writeAuditEvent({
        actorUserId: null,
        action: AUDIT_ACTIONS.authMfaFailure,
        entityType: 'User',
        entityId: userId,
        metadata: { reason: 'rate_limited', ...(signIn ? {} : { stage: 'enrollment' }) },
      });
    }
    throw Errors.rateLimited(limit.retryAfterSeconds);
  }

  /**
   * Counts an enrollment-confirm attempt (which checks the current password) against the SIGN-IN
   * per-account bucket: the same `login` scope, key and LOGIN_MAX_ATTEMPTS_PER_ACCOUNT limit that
   * POST /auth/login uses. Counted before Argon2, like sign-in. When it is exhausted, both enrollment
   * confirmation and normal sign-in for the account are throttled until the window ends.
   */
  private async throttleSignInAccount(userId: string, email: string): Promise<void> {
    const limit = await this.rateLimiter.hit(
      'login',
      [
        {
          key: `account:${this.hasher.hash('email', email)}`,
          limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT,
        },
      ],
      this.config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!limit.limited) return;
    if (limit.justExceeded) {
      await this.audit.writeAuditEvent({
        actorUserId: null,
        action: AUDIT_ACTIONS.authMfaFailure,
        entityType: 'User',
        entityId: userId,
        metadata: { reason: 'rate_limited', stage: 'enrollment', bucket: 'sign_in_account' },
      });
    }
    throw Errors.rateLimited(limit.retryAfterSeconds);
  }

  /** Refuses verification while the account's escalating MFA lockout is active. */
  private async assertNotLocked(userId: string): Promise<void> {
    const ttlMs = await this.redisOp((redis) => redis.pttl(this.lockKey(userId)));
    // -2 = no lock; -1 = a lock without expiry (never written by us, but treat it as locked).
    if (ttlMs === -2) return;
    throw mfaLocked(ttlMs > 0 ? Math.ceil(ttlMs / 1000) : this.config.MFA_LOCKOUT_SECONDS);
  }

  /**
   * Counts a wrong code in the long (default 24 h) window. Reaching MFA_LOCKOUT_THRESHOLD locks
   * verification for MFA_LOCKOUT_SECONDS (or until an access reset); every further failure while the
   * window lasts re-arms it. The lock is audited once each time it is newly set.
   */
  private async recordFailure(userId: string): Promise<void> {
    const failureKey = this.failureKey(userId);
    const results = await this.redisOp((redis) =>
      redis
        .multi()
        .incr(failureKey)
        .expire(failureKey, this.config.MFA_LOCKOUT_WINDOW_SECONDS, 'NX')
        .exec(),
    );
    if (results?.length !== 2 || results.some(([error]) => error)) throw Errors.authUnavailable();
    const failures = Number(results[0]?.[1] ?? 0);
    if (failures < this.config.MFA_LOCKOUT_THRESHOLD) return;
    const locked = await this.redisOp((redis) =>
      redis.set(this.lockKey(userId), '1', 'EX', this.config.MFA_LOCKOUT_SECONDS, 'NX'),
    );
    if (locked !== 'OK') return;
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.authMfaLocked,
      entityType: 'User',
      entityId: userId,
      metadata: {
        failures,
        threshold: this.config.MFA_LOCKOUT_THRESHOLD,
        windowSeconds: this.config.MFA_LOCKOUT_WINDOW_SECONDS,
        lockSeconds: this.config.MFA_LOCKOUT_SECONDS,
      },
    });
  }

  private pairKey(userId: string, ip: string): string {
    return `pair:${this.hasher.hash('user-ip', `${userId}|${ip}`)}`;
  }

  private lockKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}mfa-lock:${userId}`;
  }

  private failureKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}mfa-failures:${userId}`;
  }

  /** Keyed by the session-ID hash (never the raw session ID). */
  private verifyClaimKey(sessionId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}mfa-verify-claim:${this.sessions.hashOf(sessionId)}`;
  }

  private requireCrypto(): MfaCrypto {
    if (!this.crypto) {
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.mfaUnavailable,
        'Two-step verification is not available on this server.',
      );
    }
    return this.crypto;
  }

  private enrollmentKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}mfa-enroll:${userId}`;
  }

  private async redisOp<T>(operation: (redis: RedisService['client']) => Promise<T>): Promise<T> {
    try {
      return await withTimeout(() => operation(this.redis.client), 5_000);
    } catch (error) {
      this.logger.error({ msg: 'MFA store unavailable', reason: (error as Error).message });
      throw Errors.authUnavailable();
    }
  }
}

function invalidCode(): AppError {
  return new AppError(
    HttpStatus.UNAUTHORIZED,
    ERROR_CODES.mfaInvalidCode,
    'That code is not valid. Try the current code from your authenticator app.',
  );
}

function mfaLocked(retryAfterSeconds: number): AppError {
  return new AppError(
    HttpStatus.TOO_MANY_REQUESTS,
    ERROR_CODES.mfaLocked,
    'Two-step verification is locked after too many wrong codes. Try again later or ask an ' +
      'administrator to reset your access.',
    { headers: { 'Retry-After': String(Math.max(1, retryAfterSeconds)) } },
  );
}

function mfaAlreadyEnabled(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.mfaAlreadyEnabled,
    'Two-step verification is already set up for this account.',
  );
}
