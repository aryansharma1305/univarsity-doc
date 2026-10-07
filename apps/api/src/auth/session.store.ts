import { Inject, Injectable, Logger } from '@nestjs/common';
import { withTimeout } from '../common/with-timeout.js';
import { Errors } from '../common/app-error.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { RedisService } from '../redis/redis.service.js';
import { randomToken, sha256 } from './identifier-hasher.js';

/**
 * What Redis stores per session. No password material, no raw session ID, no raw IP or
 * User-Agent. The CSRF token is not stored at all: it is derived from the session ID.
 */
export interface SessionRecord {
  /** Public handle used by the session list / revoke API. Not usable to authenticate. */
  publicId: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
  device: string | null;
  ipHash: string | null;
}

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

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly redis: RedisService,
  ) {}

  async create(input: { userId: string; device: string | null; ipHash: string | null }): Promise<{
    sessionId: string;
    record: SessionRecord;
  }> {
    const sessionId = randomToken(32);
    const keyHash = sha256(sessionId);
    const now = Date.now();
    const record: SessionRecord = {
      publicId: randomToken(12),
      userId: input.userId,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: now + this.config.SESSION_ABSOLUTE_TIMEOUT_SECONDS * 1000,
      device: input.device,
      ipHash: input.ipHash,
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
    const updated = { ...record, lastSeenAt: now };
    await this.op((redis) =>
      redis.set(
        this.sessionKey(sha256(sessionId)),
        JSON.stringify(updated),
        'PX',
        this.ttlMs(updated, now),
        'XX',
      ),
    );
    return updated;
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
    return `${this.config.REDIS_KEY_PREFIX}session:${keyHash}`;
  }

  private userKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}user-sessions:${userId}`;
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
    const value = JSON.parse(raw) as Partial<SessionRecord>;
    return typeof value.userId === 'string' && typeof value.publicId === 'string'
      ? (value as SessionRecord)
      : null;
  } catch {
    return null;
  }
}
