import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PasswordResetStore } from '../../src/auth/password-reset.store.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { API_CONFIG, type ApiConfig } from '../../src/config/api-config.js';
import { createTestApp, realConfig } from '../helpers.js';
let app: INestApplication;
beforeAll(async () => {
  app = await createTestApp(realConfig());
});
afterAll(async () => {
  await app.close();
});

it('keeps only one live reset link when requests issue concurrently', async () => {
  const store = app.get(PasswordResetStore);
  const redis = app.get(RedisService).client;
  const config = app.get<ApiConfig>(API_CONFIG);
  const userId = randomUUID();
  const key = `${config.REDIS_KEY_PREFIX}pwreset-user:${userId}`;
  const read = redis.get.bind(redis);
  let arrivals = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(redis, 'get').mockImplementation(async (input) => {
    const value = await read(input);
    if (input === key) {
      if (++arrivals === 2) release();
      await gate;
    }
    return value;
  });
  let tokens: { token: string }[];
  try {
    tokens = await Promise.all([store.issue(userId), store.issue(userId)]);
  } finally {
    spy.mockRestore();
  }
  const live = await Promise.all(tokens.map(({ token }) => store.peek(token)));
  expect(live.filter(Boolean)).toHaveLength(1);
});

it('does not lose the current reset pointer when consuming and issuing concurrently', async () => {
  const store = app.get(PasswordResetStore);
  for (let i = 0; i < 10; i++) {
    const userId = randomUUID();
    const previous = await store.issue(userId);
    const [, next] = await Promise.all([store.consume(previous.token), store.issue(userId)]);
    const newest = await store.issue(userId);
    expect(await store.peek(next.token)).toBeNull();
    expect(await store.peek(newest.token)).toBe(userId);
    expect(await store.consume(newest.token)).toBe(userId);
    expect(await store.consume(newest.token)).toBeNull();
  }
});
