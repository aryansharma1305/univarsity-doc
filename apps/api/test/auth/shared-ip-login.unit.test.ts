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
import type { PrismaService } from '../../src/database/prisma.service.js';
import type { RedisService } from '../../src/redis/redis.service.js';
import { StudentAuthService } from '../../src/student-auth/student-auth.service.js';
import type { StudentSessionStore } from '../../src/student-auth/student-session.store.js';
import type { UsersService, UserForAuth } from '../../src/users/users.service.js';
import { realConfig } from '../helpers.js';

/**
 * Staff sign-in and student activation against the REAL Redis rate limiter, with the database,
 * Argon2 and sessions stubbed: only the throttling decisions are under test (no PostgreSQL needed).
 */
let redis: Redis;
const prefixes: string[] = [];
const PASSWORD = 'the right password for everyone';

beforeAll(() => {
  redis = new Redis(realConfig().REDIS_URL, { maxRetriesPerRequest: 1 });
});
afterAll(async () => {
  for (const prefix of prefixes) {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
  }
  redis.disconnect();
});

const audit = { writeAuditEvent: () => Promise.resolve() } as unknown as AuditService;

function setup(overrides: Partial<ApiConfig>) {
  const config = realConfig(overrides);
  prefixes.push(config.REDIS_KEY_PREFIX);
  return { config, limiter: new RateLimiter(config, { client: redis } as unknown as RedisService) };
}

function staffService(overrides: Partial<ApiConfig>) {
  const { config, limiter } = setup(overrides);
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
  return new AuthService(
    config,
    users,
    passwords,
    sessions,
    limiter,
    new IdentifierHasher(config),
    audit,
    {} as PasswordResetStore,
    {} as PasswordResetNotifier,
    { isAvailable: () => true } as unknown as MfaService,
  );
}

const client = (ip = '203.0.113.7') => ({ ip, userAgent: undefined, existingSessionId: undefined });
const statusOf = (pending: Promise<unknown>) =>
  pending.then(
    () => 200,
    (error: unknown) => (error as { status?: number }).status ?? 500,
  );
const login = (service: AuthService, email: string, password: string, ip?: string) =>
  statusOf(service.login({ email, password }, client(ip)));

describe('staff sign-in behind one campus NAT address', () => {
  it('more correct sign-ins than LOGIN_MAX_ATTEMPTS_PER_IP all succeed; wrong passwords still exhaust it', async () => {
    const service = staffService({ LOGIN_MAX_ATTEMPTS_PER_IP: 3 });
    for (let i = 0; i < 6; i++)
      expect(await login(service, `s${i}@example.test`, PASSWORD)).toBe(200);
    for (let i = 0; i < 3; i++)
      expect(await login(service, `o${i}@example.test`, 'wrong')).toBe(401);
    expect(await login(service, 'late@example.test', PASSWORD)).toBe(429);
  });

  it('the non-refunded total cap stops even all-successful sign-ins from one address', async () => {
    const service = staffService({ LOGIN_MAX_TOTAL_ATTEMPTS_PER_IP: 4 });
    for (let i = 0; i < 4; i++)
      expect(await login(service, `c${i}@example.test`, PASSWORD)).toBe(200);
    expect(await login(service, 'c4@example.test', PASSWORD)).toBe(429);
    // Another address is unaffected.
    expect(await login(service, 'c5@example.test', PASSWORD, '198.51.100.9')).toBe(200);
  });

  it('per-account and account+IP limits are unchanged', async () => {
    const service = staffService({
      LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: 4,
      LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP: 2,
    });
    // account+IP: 2 wrong from one address, then even the right password waits there.
    expect(await login(service, 'pair@example.test', 'wrong')).toBe(401);
    expect(await login(service, 'pair@example.test', 'wrong')).toBe(401);
    expect(await login(service, 'pair@example.test', PASSWORD)).toBe(429);
    // account: wrong passwords from many addresses add up to the per-account limit.
    for (let i = 0; i < 4; i++) {
      expect(await login(service, 'acct@example.test', 'wrong', `192.0.2.${i + 1}`)).toBe(401);
    }
    expect(await login(service, 'acct@example.test', PASSWORD, '192.0.2.99')).toBe(429);
  });
});

describe('student activation behind one campus NAT address', () => {
  it('wrong activation codes still exhaust the per-IP activation bucket (30)', async () => {
    const { config, limiter } = setup({});
    const prisma = {
      client: {
        studentRegistration: {
          findUnique: () =>
            Promise.resolve({
              id: 'reg',
              status: 'ACTIVE',
              studentId: 'stu',
              student: { fullName: 'Test Student', account: null },
              activationCodes: [
                { id: 'code', codeHash: 'never-matches', expiresAt: new Date(), failedAttempts: 0 },
              ],
            }),
        },
        studentActivationCode: { update: () => Promise.resolve({}) },
      },
    } as unknown as PrismaService;
    const service = new StudentAuthService(
      config,
      prisma,
      {} as PasswordService,
      {} as StudentSessionStore,
      limiter,
      new IdentifierHasher(config),
      audit,
    );
    const attempt = (i: number) =>
      statusOf(
        service.activate(
          { registrationNumber: `REG-${i}`, activationCode: 'ABCDEFGHJKLM', password: PASSWORD },
          client(),
        ),
      );
    // Different registrations, so only the per-IP bucket can stop the guessing.
    for (let i = 0; i < 30; i++) expect(await attempt(i)).toBe(400);
    expect(await attempt(30)).toBe(429);
  });
});
