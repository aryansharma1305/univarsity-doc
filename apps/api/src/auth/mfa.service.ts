import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type AuthUser,
  ERROR_CODES,
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
import { UsersService } from '../users/users.service.js';
import type { AuthContext } from './auth.decorators.js';
import { summariseUserAgent } from './device-summary.js';
import { IdentifierHasher } from './identifier-hasher.js';
import { generateRecoveryCodes, MfaCrypto } from './mfa-crypto.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionStore } from './session.store.js';
import { describeUser } from './auth-user.js';
import { staffNextStep } from './staff-steps.js';
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';

/** A pending-MFA session must be completed within this time, or the password step starts again. */
export const MFA_PENDING_SESSION_SECONDS = 300;
/** An unconfirmed enrollment secret lives this long (Redis, encrypted). */
const ENROLLMENT_TTL_SECONDS = 600;
const ISSUER = 'Docversity';

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
   * Activates MFA after a valid code proves the authenticator holds the secret. Issues fresh
   * single-use recovery codes (returned once), ends the user's other sessions, and audits MFA_ENABLED
   * in the same transaction as the change.
   */
  async confirmEnrollment(auth: AuthContext, code: string): Promise<MfaEnrollmentConfirmResponse> {
    const crypto = this.requireCrypto();
    await this.throttle('mfa-enroll', auth.user.id, null);
    const pending = await this.redisOp((redis) => redis.get(this.enrollmentKey(auth.user.id)));
    if (!pending) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.mfaEnrollmentExpired,
        'This setup has expired. Start again to get a new QR code.',
      );
    }
    let secret: Buffer;
    try {
      secret = crypto.decrypt(pending, auth.user.id, 'enrollment');
    } catch {
      throw Errors.authUnavailable();
    }
    const step = verifyTotp(secret, code, Date.now(), null);
    if (step === null) throw invalidCode();

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: auth.user.id, status: 'ACTIVE', mfaEnabledAt: null },
        data: {
          mfaTotpSecretEnc: crypto.encrypt(secret, auth.user.id, 'secret'),
          mfaTotpLastUsedStep: BigInt(step),
          mfaEnabledAt: new Date(),
        },
      });
      if (updated.count !== 1) throw mfaAlreadyEnabled();
      await tx.staffMfaRecoveryCode.deleteMany({ where: { userId: auth.user.id } });
      await tx.staffMfaRecoveryCode.createMany({
        data: recoveryCodes.map((item) => ({
          userId: auth.user.id,
          codeHash: crypto.hashRecoveryCode(auth.user.id, item.normalised),
        })),
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: auth.user.id,
          action: AUDIT_ACTIONS.mfaEnabled,
          entityType: 'User',
          entityId: auth.user.id,
          metadata: { method: 'totp', recoveryCodeCount: recoveryCodes.length },
        },
        tx,
      );
    });
    await this.redisOp((redis) => redis.del(this.enrollmentKey(auth.user.id)));
    await this.sessions.revokeAllForUser(auth.user.id, { exceptSessionId: auth.sessionId });
    return {
      recoveryCodes: recoveryCodes.map((item) => item.display),
      user: await this.currentUser(auth.user.id, null),
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
    await this.throttle('mfa', userId, client.ip);

    const method = input.code !== undefined ? 'totp' : 'recovery_code';
    const accepted =
      input.code !== undefined
        ? await this.consumeTotp(crypto, userId, input.code)
        : await this.consumeRecoveryCode(crypto, userId, input.recoveryCode ?? '');
    if (!accepted) {
      await this.audit.writeAuditEvent({
        actorUserId: null,
        action: AUDIT_ACTIONS.authMfaFailure,
        entityType: 'User',
        entityId: userId,
        metadata: { method, reason: 'invalid_code', ipHash },
      });
      throw invalidCode();
    }

    const user = await this.users.findForAuthById(userId);
    if (user?.status !== 'ACTIVE' || !user.passwordHash) throw Errors.sessionExpired();
    await this.sessions.revoke(auth.sessionId);
    const device = summariseUserAgent(client.userAgent);
    const { sessionId, record } = await this.sessions.create({
      userId,
      passwordHash: user.passwordHash,
      device,
      ipHash,
    });
    await this.rateLimiter.clear('mfa', [
      `pair:${this.hasher.hash('user-ip', `${userId}|${client.ip}`)}`,
      `account:${userId}`,
    ]);
    await this.audit.writeAuditEvent({
      actorUserId: userId,
      action: AUDIT_ACTIONS.authMfaVerified,
      entityType: 'User',
      entityId: userId,
      metadata: { method, sessionHandle: record.publicId, device, ipHash },
    });
    return { sessionId, user: await this.currentUser(userId, record) };
  }

  /** Drops an unconfirmed enrollment secret (e.g. after an administrator reset). */
  async discardEnrollment(userId: string): Promise<void> {
    await this.redisOp((redis) => redis.del(this.enrollmentKey(userId)));
  }

  /** The AuthUser view of a user (with the step their session still has to complete). */
  async currentUser(userId: string, record: { stage?: 'mfa' } | null): Promise<AuthUser> {
    const user = await this.users.findForAuthById(userId);
    if (!user) throw Errors.sessionExpired();
    const nextStep = staffNextStep(record ?? {}, user, this.config);
    return describeUser(user, nextStep);
  }

  private async consumeTotp(crypto: MfaCrypto, userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { mfaTotpSecretEnc: true, mfaTotpLastUsedStep: true },
    });
    if (!row?.mfaTotpSecretEnc) return false;
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
    if (step === null) return false;
    // Compare-and-set: a concurrent request with the same (or a later) step loses.
    const updated = await this.prisma.client.user.updateMany({
      where: {
        id: userId,
        mfaEnabledAt: { not: null },
        OR: [{ mfaTotpLastUsedStep: null }, { mfaTotpLastUsedStep: { lt: BigInt(step) } }],
      },
      data: { mfaTotpLastUsedStep: BigInt(step) },
    });
    return updated.count === 1;
  }

  private async consumeRecoveryCode(
    crypto: MfaCrypto,
    userId: string,
    normalised: string,
  ): Promise<boolean> {
    const codeHash = crypto.hashRecoveryCode(userId, normalised);
    return this.prisma.client.$transaction(async (tx) => {
      const spent = await tx.staffMfaRecoveryCode.updateMany({
        where: { userId, codeHash, usedAt: null, user: { mfaEnabledAt: { not: null } } },
        data: { usedAt: new Date() },
      });
      if (spent.count !== 1) return false;
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
      return true;
    });
  }

  /**
   * Sign-in step: the same limits as password sign-in (per user+IP, per user, per IP; own scope).
   * Enrollment (ip = null): the per-account+IP allowance per user.
   */
  private async throttle(scope: 'mfa' | 'mfa-enroll', userId: string, ip: string | null) {
    const rules =
      ip === null
        ? [{ key: `account:${userId}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP }]
        : [
            {
              key: `pair:${this.hasher.hash('user-ip', `${userId}|${ip}`)}`,
              limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP,
            },
            { key: `account:${userId}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT },
            {
              key: `ip:${this.hasher.hash('ip', ip)}`,
              limit: this.config.LOGIN_MAX_ATTEMPTS_PER_IP,
            },
          ];
    const limit = await this.rateLimiter.hit(
      scope,
      rules,
      this.config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!limit.limited) return;
    if (limit.justExceeded && scope === 'mfa') {
      // Once per window, like password sign-in, so an attack cannot flood the audit log.
      await this.audit.writeAuditEvent({
        actorUserId: null,
        action: AUDIT_ACTIONS.authMfaFailure,
        entityType: 'User',
        entityId: userId,
        metadata: { reason: 'rate_limited' },
      });
    }
    throw Errors.rateLimited(limit.retryAfterSeconds);
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

function mfaAlreadyEnabled(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.mfaAlreadyEnabled,
    'Two-step verification is already set up for this account.',
  );
}
