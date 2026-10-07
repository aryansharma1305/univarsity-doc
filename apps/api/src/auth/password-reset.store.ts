import { Inject, Injectable, Logger } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { withTimeout } from '../common/with-timeout.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { RedisService } from '../redis/redis.service.js';
import { randomToken, sha256 } from './identifier-hasher.js';

/**
 * Single-use password-reset tokens in Redis. Only the SHA-256 of a token is stored:
 *   <prefix>pwreset:<sha256(token)>  → userId   (TTL = PASSWORD_RESET_TOKEN_TTL_SECONDS)
 *   <prefix>pwreset-user:<userId>    → sha256(token)   (a new request invalidates the previous token)
 */
@Injectable()
export class PasswordResetStore {
  private readonly logger = new Logger(PasswordResetStore.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly redis: RedisService,
  ) {}

  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken(32);
    const tokenHash = sha256(token);
    const ttl = this.config.PASSWORD_RESET_TOKEN_TTL_SECONDS;
    await this.op(async (redis) => {
      const previous = await redis.get(this.userKey(userId));
      const pipeline = redis.multi();
      if (previous) pipeline.del(this.tokenKey(previous));
      await pipeline
        .set(this.tokenKey(tokenHash), userId, 'EX', ttl)
        .set(this.userKey(userId), tokenHash, 'EX', ttl)
        .exec();
    });
    return { token, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  /** The user a token belongs to, without consuming it. */
  peek(token: string): Promise<string | null> {
    return this.op((redis) => redis.get(this.tokenKey(sha256(token))));
  }

  /** Atomically consumes the token. Returns the user ID, or null if it was already used/expired. */
  async consume(token: string): Promise<string | null> {
    const tokenHash = sha256(token);
    const userId = await this.op((redis) => redis.getdel(this.tokenKey(tokenHash)));
    if (userId) await this.op((redis) => redis.del(this.userKey(userId)));
    return userId;
  }

  private tokenKey(tokenHash: string): string {
    return `${this.config.REDIS_KEY_PREFIX}pwreset:${tokenHash}`;
  }

  private userKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}pwreset-user:${userId}`;
  }

  private async op<T>(operation: (redis: RedisService['client']) => Promise<T>): Promise<T> {
    try {
      return await withTimeout(() => operation(this.redis.client), 5_000);
    } catch (error) {
      this.logger.error({
        msg: 'Password reset store unavailable',
        reason: (error as Error).message,
      });
      throw Errors.authUnavailable();
    }
  }
}
