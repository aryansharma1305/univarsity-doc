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
const redisKey = (key: string) => `${config.REDIS_KEY_PREFIX}rl:t:${key}`;

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
    expect(await redis.ttl(redisKey(key))).toBeGreaterThan(0);
  });
});

describe('RateLimiter.refund (shared campus NAT)', () => {
  it('lets many successes from one address through while failures still count', async () => {
    const ip = fresh();
    const rule = [{ key: ip, limit: 3 }];
    for (let i = 0; i < 10; i++) {
      const hit = await limiter.hit('t', rule, 60);
      expect(hit.limited).toBe(false);
      await limiter.refund('t', hit, [ip]);
    }
    for (let i = 0; i < 3; i++) expect((await limiter.hit('t', rule, 60)).limited).toBe(false);
    expect((await limiter.hit('t', rule, 60)).limited).toBe(true);
  });

  it('never goes below zero and never creates a key without expiry', async () => {
    const key = fresh();
    const hit = await limiter.hit('t', [{ key, limit: 5 }], 60);
    await limiter.refund('t', hit, [key]);
    await limiter.refund('t', hit, [key]);
    expect(await redis.get(redisKey(key))).toBe('0');
    expect(await redis.ttl(redisKey(key))).toBeGreaterThan(0);
    await redis.del(redisKey(key));
    await limiter.refund('t', hit, [key]); // window gone: no-op, nothing created
    expect(await redis.exists(redisKey(key))).toBe(0);
  });

  it('after a window rollover the refund credits nothing to the new window', async () => {
    const key = fresh();
    const rule = [{ key, limit: 1 }];
    const stale = await limiter.hit('t', rule, 1); // request starts in window 1
    await sleep(1_200);
    expect((await limiter.hit('t', rule, 1)).limited).toBe(false); // someone else, window 2
    await limiter.refund('t', stale, [key]); // the first request finishes late
    expect(await redis.get(redisKey(key))).toBe('1');
    expect((await limiter.hit('t', rule, 1)).limited).toBe(true);
  });

  it('concurrent successes and failures never go below zero or allow more than N failures', async () => {
    const ip = fresh();
    const rule = [{ key: ip, limit: 5 }];
    const success = async () => {
      const hit = await limiter.hit('t', rule, 60);
      if (!hit.limited) await limiter.refund('t', hit, [ip]);
      return hit.limited;
    };
    const failure = async () => (await limiter.hit('t', rule, 60)).limited;
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? success() : failure())),
    );
    const failuresAllowed = results.filter((limited, i) => i % 2 === 1 && !limited).length;
    expect(failuresAllowed).toBeLessThanOrEqual(5);
    const value = Number(await redis.get(redisKey(ip)));
    expect(value).toBeGreaterThanOrEqual(0);
    // Unrefunded units = every failure + every throttled success.
    expect(value).toBe(results.filter((limited, i) => i % 2 === 1 || limited).length);
    // The bucket is still closed for further failures this window.
    expect(await failure()).toBe(true);
  });
});
