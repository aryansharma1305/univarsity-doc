import { Inject, Injectable, Logger } from '@nestjs/common';
import { withTimeout } from '../common/with-timeout.js';
import { Errors } from '../common/app-error.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { RedisService } from '../redis/redis.service.js';
import { createHmac } from 'node:crypto';
import { randomToken, safeEqual, sha256 } from './identifier-hasher.js';

/**
 * What Redis stores per session. No password material, no raw session ID, no raw IP or
 * User-Agent. The CSRF token is not stored at all: it is derived from the session ID.
 */
export interface SessionRecord {
  /** Public handle used by the session list / revoke API. Not usable to authenticate. */
  publicId: string;
  userId: string;
  /**
   * Keyed binding to the verified credential AND (staff) the account's MFA state; never the password
   * or its stored hash. See `credentialVersion()`.
   */
  credentialVersion: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
  device: string | null;
  ipHash: string | null;
  /**
   * Absent = a full session. `mfa` = the password was verified but the authenticator step is still
   * pending: the guard lets such a session reach only the MFA verification endpoint (+ me/csrf/logout).
   * Its credential binding uses a separate HMAC domain, so code that does not know about stages
   * (including the previous release reading the same Redis) rejects it instead of treating it as full.
   */
  stage?: SessionStage;
}

export type SessionStage = 'mfa';

export interface StoredSession {
  keyHash: string;
  record: SessionRecord;
}

/** Deadline for each session-store call; on expiry authentication fails closed (503). */
const REDIS_TIMEOUT_MS = 5_000;

/**
 * Redis-backed server-side sessions.
 *
 * Keys (prefix = REDIS_KEY_PREFIX, default `dv:`):
 *   <prefix>session:<sha256(sessionId)>   JSON SessionRecord, TTL = min(idle timeout, time left)
 *   <prefix>user-sessions:<userId>        SET of session key hashes (for listing / revoke-all)
 *
 * The browser holds the only copy of the raw 256-bit session ID. A Redis dump alone therefore
 * cannot be replayed as a cookie.
 *
 * Every Redis failure becomes AUTH_SERVICE_UNAVAILABLE (503): authentication fails closed.
 */
@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);
  /** Redis key names; the student store uses its own (see StudentSessionStore). */
  protected readonly keys = { session: 'session', index: 'user-sessions' };

  constructor(
    @Inject(API_CONFIG) protected readonly config: ApiConfig,
    private readonly redis: RedisService,
  ) {}

  async create(input: {
    userId: string;
    passwordHash: string;
    device: string | null;
    ipHash: string | null;
    stage?: SessionStage;
    /**
     * Staff: the `users.mfa_enabled_at` the session was authenticated against (null = no MFA). The
     * session stops matching as soon as the account's MFA state differs. Students omit it.
     */
    mfaEnabledAt?: Date | null;
    /** Shorter absolute lifetime (e.g. pending-MFA sessions); never longer than the configured one. */
    absoluteTimeoutSeconds?: number;
  }): Promise<{
    sessionId: string;
    record: SessionRecord;
  }> {
    const sessionId = randomToken(32);
    const keyHash = sha256(sessionId);
    const now = Date.now();
    const lifetimeSeconds = Math.min(
      input.absoluteTimeoutSeconds ?? this.config.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
      this.config.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    );
    const record: SessionRecord = {
      publicId: randomToken(12),
      userId: input.userId,
      credentialVersion: this.credentialVersion(
        input.passwordHash,
        input.stage,
        input.mfaEnabledAt ?? null,
      ),
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: now + lifetimeSeconds * 1000,
      device: input.device,
      ipHash: input.ipHash,
      ...(input.stage ? { stage: input.stage } : {}),
    };
    await this.op(async (redis) => {
      await redis
        .multi()
        .set(this.sessionKey(keyHash), JSON.stringify(record), 'PX', this.ttlMs(record, now))
        .sadd(this.userKey(input.userId), keyHash)
        .pexpire(this.userKey(input.userId), this.config.SESSION_ABSOLUTE_TIMEOUT_SECONDS * 1000)
        .exec();
    });
    return { sessionId, record };
  }

  /** Returns the live session, or null if it does not exist or has passed its idle/absolute limit. */
  async read(sessionId: string): Promise<SessionRecord | null> {
    const keyHash = sha256(sessionId);
    const raw = await this.op((redis) => redis.get(this.sessionKey(keyHash)));
    if (!raw) return null;
    const record = parseRecord(raw);
    const now = Date.now();
    if (
      !record ||
      now >= record.absoluteExpiresAt ||
      now - record.lastSeenAt >= this.config.SESSION_IDLE_TIMEOUT_SECONDS * 1000
    ) {
      await this.deleteByHash(record?.userId, keyHash);
      return null;
    }
    return record;
  }

  /** Records activity: extends the idle window (never beyond the absolute expiry). */
  async touch(sessionId: string, record: SessionRecord): Promise<SessionRecord> {
    const now = Date.now();
    const raw = await this.op((redis) =>
      redis.eval(
        `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return false end
      local value = cjson.decode(raw)
      if value.userId ~= ARGV[1] then return false end
      local now = tonumber(ARGV[2])
      local ttl = math.min(tonumber(ARGV[3]), value.absoluteExpiresAt - now)
      if ttl <= 0 then return false end
      value.lastSeenAt = now
      local updated = cjson.encode(value)
      redis.call('SET', KEYS[1], updated, 'PX', ttl)
      return updated
    `,
        1,
        this.sessionKey(sha256(sessionId)),
        record.userId,
        now,
        this.config.SESSION_IDLE_TIMEOUT_SECONDS * 1000,
      ),
    );
    const updated = typeof raw === 'string' ? parseRecord(raw) : null;
    if (!updated) throw Errors.sessionExpired();
    return updated;
  }

  /** Rebind only the still-live current session; ordinary activity cannot overwrite this value. */
  async replaceCredential(
    sessionId: string,
    record: SessionRecord,
    passwordHash: string,
    mfaEnabledAt: Date | null = null,
  ): Promise<void> {
    const changed = await this.op((redis) =>
      redis.eval(
        `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return false end
      local value = cjson.decode(raw)
      if value.userId ~= ARGV[1] or value.credentialVersion ~= ARGV[2] then return false end
      if value.stage then return false end
      value.credentialVersion = ARGV[3]
      return redis.call('SET', KEYS[1], cjson.encode(value), 'XX', 'KEEPTTL')
    `,
        1,
        this.sessionKey(sha256(sessionId)),
        record.userId,
        record.credentialVersion,
        this.credentialVersion(passwordHash, undefined, mfaEnabledAt),
      ),
    );
    if (changed !== 'OK') throw Errors.sessionExpired();
  }

  async revoke(sessionId: string): Promise<SessionRecord | null> {
    const keyHash = sha256(sessionId);
    const raw = await this.op((redis) => redis.getdel(this.sessionKey(keyHash)));
    const record = raw ? parseRecord(raw) : null;
    if (record) await this.op((redis) => redis.srem(this.userKey(record.userId), keyHash));
    return record;
  }

  /** Live sessions of a user (stale index entries are pruned). */
  async list(userId: string): Promise<StoredSession[]> {
    const hashes = await this.op((redis) => redis.smembers(this.userKey(userId)));
    if (hashes.length === 0) return [];
    const values = await this.op((redis) =>
      redis.mget(hashes.map((hash) => this.sessionKey(hash))),
    );
    const now = Date.now();
    const live: StoredSession[] = [];
    const stale: string[] = [];
    hashes.forEach((keyHash, index) => {
      const record = values[index] ? parseRecord(values[index]) : null;
      if (record?.userId === userId && now < record.absoluteExpiresAt) {
        live.push({ keyHash, record });
      } else {
        stale.push(keyHash);
      }
    });
    if (stale.length > 0) await this.op((redis) => redis.srem(this.userKey(userId), ...stale));
    return live.sort((a, b) => b.record.lastSeenAt - a.record.lastSeenAt);
  }

  async revokeByPublicId(userId: string, publicId: string): Promise<boolean> {
    const target = (await this.list(userId)).find(
      (session) => session.record.publicId === publicId,
    );
    if (!target) return false;
    await this.deleteByHash(userId, target.keyHash);
    return true;
  }

  /** Revokes every session of the user, optionally keeping one (e.g. the current session). */
  async revokeAllForUser(
    userId: string,
    options: { exceptSessionId?: string } = {},
  ): Promise<number> {
    const keep = options.exceptSessionId ? sha256(options.exceptSessionId) : undefined;
    const sessions = await this.list(userId);
    const doomed = sessions.filter((session) => session.keyHash !== keep);
    for (const session of doomed) await this.deleteByHash(userId, session.keyHash);
    return doomed.length;
  }

  /**
   * HMAC over the password hash, the session stage and the account's MFA state. A session is valid
   * only while all three still match the account, re-checked on every request by the guard:
   * - a password change/reset changes the hash;
   * - turning MFA on (or a reset turning it off, or re-enrollment) changes `mfaEnabledAt`, so a
   *   session authenticated under a different MFA state (e.g. a password-only login that raced the
   *   enrollment commit) stops matching, regardless of whether its Redis revocation ran.
   * Without MFA the input is unchanged from earlier releases, so their sessions stay valid both ways.
   */
  credentialVersion(
    passwordHash: string,
    stage?: SessionStage,
    mfaEnabledAt: Date | null = null,
  ): string {
    const domain = stage ? `${this.keys.session}:${stage}-pending` : this.keys.session;
    const mfa = mfaEnabledAt === null ? '' : `\0mfa:${mfaEnabledAt.getTime()}`;
    return createHmac('sha256', this.config.SESSION_SECRET)
      .update(`credential:${domain}\0${passwordHash}${mfa}`)
      .digest('hex');
  }

  matchesCredential(
    record: SessionRecord,
    passwordHash: string | null,
    mfaEnabledAt: Date | null = null,
  ): boolean {
    return (
      passwordHash !== null &&
      safeEqual(
        record.credentialVersion,
        this.credentialVersion(passwordHash, record.stage, mfaEnabledAt),
      )
    );
  }

  hashOf(sessionId: string): string {
    return sha256(sessionId);
  }

  private async deleteByHash(userId: string | undefined, keyHash: string): Promise<void> {
    await this.op(async (redis) => {
      const pipeline = redis.multi().del(this.sessionKey(keyHash));
      if (userId) pipeline.srem(this.userKey(userId), keyHash);
      await pipeline.exec();
    });
  }

  private ttlMs(record: SessionRecord, now: number): number {
    return Math.max(
      1,
      Math.min(this.config.SESSION_IDLE_TIMEOUT_SECONDS * 1000, record.absoluteExpiresAt - now),
    );
  }

  private sessionKey(keyHash: string): string {
    return `${this.config.REDIS_KEY_PREFIX}${this.keys.session}:${keyHash}`;
  }

  private userKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}${this.keys.index}:${userId}`;
  }

  private async op<T>(operation: (redis: RedisService['client']) => Promise<T>): Promise<T> {
    try {
      return await withTimeout(() => operation(this.redis.client), REDIS_TIMEOUT_MS);
    } catch (error) {
      this.logger.error({ msg: 'Session store unavailable', reason: (error as Error).message });
      throw Errors.authUnavailable();
    }
  }
}

function parseRecord(raw: string): SessionRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<Omit<SessionRecord, 'stage'>> & { stage?: unknown };
    return typeof value.userId === 'string' &&
      typeof value.publicId === 'string' &&
      (value.stage === undefined || value.stage === 'mfa') &&
      typeof value.credentialVersion === 'string' &&
      /^[0-9a-f]{64}$/.test(value.credentialVersion)
      ? (value as SessionRecord)
      : null;
  } catch {
    return null;
  }
}
