import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import type { ApiConfig } from '../../src/config/api-config.js';
import type { RedisService } from '../../src/redis/redis.service.js';
import { realConfig } from '../helpers.js';

let config: ApiConfig;
let redis: Redis;
let limiter: RateLimiter;

beforeAll(() => {
  config = realConfig();
  redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
  limiter = new RateLimiter(config, { client: redis } as unknown as RedisService);
});
afterAll(async () => {
  const keys = await redis.keys(`${config.REDIS_KEY_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
  redis.disconnect();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let n = 0;
const fresh = () => `case-${++n}`;

describe('RateLimiter fixed windows', () => {
  it('limits after the allowance and starts a fresh window once the TTL ends', async () => {
    const key = fresh();
    const rule = [{ key, limit: 2 }];
    expect((await limiter.hit('t', rule, 1)).limited).toBe(false);
    expect((await limiter.hit('t', rule, 1)).limited).toBe(false);
    const third = await limiter.hit('t', rule, 1);
    expect(third).toMatchObject({ limited: true, justExceeded: true });
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    // Throttled attempts do not extend the window (EXPIRE NX): it still ends on time.
    expect((await limiter.hit('t', rule, 1)).justExceeded).toBe(false);
    await sleep(1_200);
    expect((await limiter.hit('t', rule, 1)).limited).toBe(false);
    const ttl = await redis.ttl(`${config.REDIS_KEY_PREFIX}rl:t:${key}`);
    expect(ttl).toBeGreaterThan(0);
  });
});

describe('RateLimiter.refund (shared campus NAT)', () => {
  it('lets many successes from one address through while failures still count', async () => {
    const ip = fresh();
    const rule = [{ key: ip, limit: 3 }];
    // Ten different people sign in successfully from one NAT address.
    for (let i = 0; i < 10; i++) {
      expect((await limiter.hit('t', rule, 60)).limited).toBe(false);
      await limiter.refund('t', [ip]);
    }
    // Failures are never refunded: the 4th wrong attempt from the address is throttled.
    for (let i = 0; i < 3; i++) expect((await limiter.hit('t', rule, 60)).limited).toBe(false);
    expect((await limiter.hit('t', rule, 60)).limited).toBe(true);
  });

  it('never goes below zero and never creates a key without expiry', async () => {
    const key = fresh();
    const redisKey = `${config.REDIS_KEY_PREFIX}rl:t:${key}`;
    await limiter.refund('t', [key]); // window already ended: no-op
    expect(await redis.exists(redisKey)).toBe(0);
    await limiter.hit('t', [{ key, limit: 5 }], 60);
    await limiter.refund('t', [key]);
    await limiter.refund('t', [key]);
    expect(await redis.get(redisKey)).toBe('0');
    expect(await redis.ttl(redisKey)).toBeGreaterThan(0);
  });

  it('a refund after the window rolled over credits the new window at most one unit', async () => {
    const key = fresh();
    const rule = [{ key, limit: 1 }];
    await limiter.hit('t', rule, 1); // request starts in window 1
    await sleep(1_200);
    await limiter.hit('t', rule, 1); // someone else, window 2
    await limiter.refund('t', [key]); // the first request finishes late
    expect((await limiter.hit('t', rule, 1)).limited).toBe(false);
    expect((await limiter.hit('t', rule, 1)).limited).toBe(true);
  });
});
