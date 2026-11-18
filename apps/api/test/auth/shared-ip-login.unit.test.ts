import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditService } from '../../src/audit/audit.service.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { IdentifierHasher } from '../../src/auth/identifier-hasher.js';
import type { MfaService } from '../../src/auth/mfa.service.js';
import type { PasswordResetNotifier } from '../../src/auth/password-reset.notifier.js';
import type { PasswordResetStore } from '../../src/auth/password-reset.store.js';
import type { PasswordService } from '../../src/auth/password.service.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import type { SessionStore } from '../../src/auth/session.store.js';
import type { ApiConfig } from '../../src/config/api-config.js';
import type { RedisService } from '../../src/redis/redis.service.js';
import type { UsersService, UserForAuth } from '../../src/users/users.service.js';
import { realConfig } from '../helpers.js';

/**
 * Staff sign-in against the REAL Redis rate limiter, with the database, Argon2 and sessions stubbed:
 * only the throttling decisions are under test. Reproduces the campus-NAT lockout (many correct
 * sign-ins from one address exhausting LOGIN_MAX_ATTEMPTS_PER_IP) without PostgreSQL.
 */
let config: ApiConfig;
let redis: Redis;
let service: AuthService;
const PASSWORD = 'the right password for everyone';

beforeAll(() => {
  config = realConfig({ LOGIN_MAX_ATTEMPTS_PER_IP: 3 });
  redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
  const users = {
    findForAuthByEmail: (email: string): Promise<UserForAuth> =>
      Promise.resolve({
        id: email,
        email,
        displayName: 'Staff Member',
        status: 'ACTIVE',
        passwordHash: 'stub',
        roles: ['REGISTRAR'],
        passwordChangeRequired: false,
        mfaEnabled: false,
        mfaEnabledAt: null,
      }),
  } as unknown as UsersService;
  const passwords = {
    verifyPassword: (_hash: string, password: string) => Promise.resolve(password === PASSWORD),
    verifyAgainstDummy: () => Promise.resolve(false),
  } as unknown as PasswordService;
  const sessions = {
    revoke: () => Promise.resolve(null),
    create: () => Promise.resolve({ sessionId: 's', record: { publicId: 'p' } }),
  } as unknown as SessionStore;
  const audit = { writeAuditEvent: () => Promise.resolve() } as unknown as AuditService;
  service = new AuthService(
    config,
    users,
    passwords,
    sessions,
    new RateLimiter(config, { client: redis } as unknown as RedisService),
    new IdentifierHasher(config),
    audit,
    {} as PasswordResetStore,
    {} as PasswordResetNotifier,
    { isAvailable: () => true } as unknown as MfaService,
  );
});
afterAll(async () => {
  const keys = await redis.keys(`${config.REDIS_KEY_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
  redis.disconnect();
});

const client = { ip: '203.0.113.7', userAgent: undefined, existingSessionId: undefined };
const statusOf = (pending: Promise<unknown>) =>
  pending.then(
    () => 200,
    (error: unknown) => (error as { status?: number }).status ?? 500,
  );

describe('staff sign-in behind one campus NAT address', () => {
  it('more correct sign-ins than LOGIN_MAX_ATTEMPTS_PER_IP all succeed; failures still throttle', async () => {
    for (let i = 0; i < 6; i++) {
      const email = `staff${i}@example.test`;
      expect(await statusOf(service.login({ email, password: PASSWORD }, client))).toBe(200);
    }
    for (let i = 0; i < 3; i++) {
      const email = `other${i}@example.test`;
      expect(await statusOf(service.login({ email, password: 'wrong guess' }, client))).toBe(401);
    }
    const email = 'late@example.test';
    expect(await statusOf(service.login({ email, password: PASSWORD }, client))).toBe(429);
  });
});
