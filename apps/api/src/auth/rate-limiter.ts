import { Inject, Injectable, Logger } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { withTimeout } from '../common/with-timeout.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { RedisService } from '../redis/redis.service.js';

export interface LimitRule {
  /** Redis key suffix (already hashed — never a raw email or IP). */
  key: string;
  limit: number;
}

export interface LimitResult {
  limited: boolean;
  /** Seconds until the most restrictive exceeded window resets. */
  retryAfterSeconds: number;
  /** True only on the attempt that first crossed a limit (used to audit once, not per attempt). */
  justExceeded: boolean;
  /** Absolute expiry (Unix ms) of each rule's window as counted by this hit, by rule key. */
  windows: Record<string, number>;
}

/**
 * Fixed-window counters in Redis (INCR + EXPIRE NX in one transaction). Every attempt is counted
 * BEFORE the password is checked, so throttled requests never reach Argon2 or the database.
 * Fails closed: if Redis is unavailable the caller gets AUTH_SERVICE_UNAVAILABLE.
 */
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly redis: RedisService,
  ) {}

  async hit(scope: string, rules: LimitRule[], windowSeconds: number): Promise<LimitResult> {
    const keys = rules.map((rule) => this.key(scope, rule.key));
    const results = await this.op(async (redis) => {
      const pipeline = redis.multi();
      for (const key of keys) {
        pipeline.incr(key).expire(key, windowSeconds, 'NX').ttl(key).pexpiretime(key);
      }
      return pipeline.exec();
    });
    // EXEC can resolve with command errors (ACL/OOM), or null when aborted. Never treat these as zero attempts.
    if (results?.length !== rules.length * 4 || results.some(([error]) => error)) {
      throw Errors.authUnavailable();
    }
    let limited = false;
    let justExceeded = false;
    let retryAfterSeconds = 0;
    const windows: Record<string, number> = {};
    rules.forEach((rule, index) => {
      const count = Number(results[index * 4]?.[1] ?? 0);
      const ttl = Number(results[index * 4 + 2]?.[1] ?? windowSeconds);
      windows[rule.key] = Number(results[index * 4 + 3]?.[1] ?? 0);
      if (count > rule.limit) {
        limited = true;
        retryAfterSeconds = Math.max(retryAfterSeconds, ttl > 0 ? ttl : windowSeconds);
        if (count === rule.limit + 1) justExceeded = true;
      }
    });
    return { limited, retryAfterSeconds, justExceeded, windows };
  }

  async clear(scope: string, ruleKeys: string[]): Promise<void> {
    if (ruleKeys.length === 0) return;
    await this.op((redis) => redis.del(...ruleKeys.map((key) => this.key(scope, key))));
  }

  /**
   * Gives back the one unit a SUCCESSFUL attempt (`hit`) took from each listed counter, so
   * shared-address (campus NAT) buckets count failures only. Only within the SAME window the hit
   * counted in (identical absolute expiry): after a rollover nothing is refunded, so a new window is
   * never credited. Never creates a key or goes below zero.
   */
  async refund(scope: string, hit: LimitResult, ruleKeys: string[]): Promise<void> {
    const keys = ruleKeys.filter((key) => (hit.windows[key] ?? 0) > 0);
    if (keys.length === 0) return;
    await this.op((redis) =>
      redis.eval(
        `for i, key in ipairs(KEYS) do
          if redis.call('PEXPIRETIME', key) == tonumber(ARGV[i])
            and tonumber(redis.call('GET', key) or '0') > 0 then
            redis.call('DECR', key)
          end
        end
        return 0`,
        keys.length,
        ...keys.map((key) => this.key(scope, key)),
        ...keys.map((key) => String(hit.windows[key])),
      ),
    );
  }

  private key(scope: string, suffix: string): string {
    return `${this.config.REDIS_KEY_PREFIX}rl:${scope}:${suffix}`;
  }

  private async op<T>(operation: (redis: RedisService['client']) => Promise<T>): Promise<T> {
    try {
      return await withTimeout(() => operation(this.redis.client), 5_000);
    } catch (error) {
      this.logger.error({ msg: 'Rate limiter unavailable', reason: (error as Error).message });
      throw Errors.authUnavailable();
    }
  }
}
