import { Inject, Injectable, Logger } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { withTimeout } from '../common/with-timeout.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { RedisService } from '../redis/redis.service.js';
import { randomToken, sha256 } from './identifier-hasher.js';

interface ResetCredential {
  userId: string;
  credentialVersion: string;
}

/**
 * Single-use password-reset tokens in Redis. Only the SHA-256 of a token is stored:
 *   <prefix>pwreset-v2:<sha256(token)>  → user ID and keyed credential binding
 *   <prefix>pwreset-v2-user:<userId>    → sha256(token)   (a new request invalidates the previous token)
 * Old keys expire under their original TTL and are ignored by this version.
 */
@Injectable()
export class PasswordResetStore {
  private readonly logger = new Logger(PasswordResetStore.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly redis: RedisService,
  ) {}

  async issue(credential: ResetCredential): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken(32);
    const tokenHash = sha256(token);
    const ttl = this.config.PASSWORD_RESET_TOKEN_TTL_SECONDS;
    await this.op((redis) =>
      redis.eval(
        `
      local previous = redis.call('GET', KEYS[1])
      if previous then redis.call('DEL', ARGV[1] .. previous) end
      redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
      redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
      return 1
    `,
        2,
        this.userKey(credential.userId),
        this.tokenKey(tokenHash),
        this.tokenKey(''),
        tokenHash,
        this.encode(credential),
        ttl,
      ),
    );
    return { token, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  /** The user and credential a token was issued for, without consuming it. */
  async peek(token: string): Promise<ResetCredential | null> {
    const value = await this.op((redis) => redis.get(this.tokenKey(sha256(token))));
    if (!value) return null;
    const [userId, credentialVersion] = value.split(':');
    return userId && credentialVersion ? { userId, credentialVersion } : null;
  }

  /** Atomically consumes the current token only if it still matches the observed credential. */
  async consume(token: string, credential: ResetCredential): Promise<boolean> {
    const tokenHash = sha256(token);
    const consumed = await this.op((redis) =>
      redis.eval(
        `
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
      redis.call('DEL', KEYS[1], KEYS[2])
      return 1
    `,
        2,
        this.tokenKey(tokenHash),
        this.userKey(credential.userId),
        this.encode(credential),
        tokenHash,
      ),
    );
    return consumed === 1;
  }

  /** Invalidates the user's outstanding reset token, if any (disable, re-enable, access reset). */
  async revokeForUser(userId: string): Promise<void> {
    await this.op((redis) =>
      redis.eval(
        `
      local previous = redis.call('GET', KEYS[1])
      if previous then redis.call('DEL', ARGV[1] .. previous) end
      redis.call('DEL', KEYS[1])
      return 1
    `,
        1,
        this.userKey(userId),
        this.tokenKey(''),
      ),
    );
  }

  private tokenKey(tokenHash: string): string {
    return `${this.config.REDIS_KEY_PREFIX}pwreset-v2:${tokenHash}`;
  }

  private userKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}pwreset-v2-user:${userId}`;
  }

  private encode({ userId, credentialVersion }: ResetCredential): string {
    return `${userId}:${credentialVersion}`;
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
