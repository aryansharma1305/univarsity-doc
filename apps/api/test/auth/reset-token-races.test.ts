import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PasswordResetStore } from '../../src/auth/password-reset.store.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { API_CONFIG, type ApiConfig } from '../../src/config/api-config.js';
import { createTestApp, realConfig } from '../helpers.js';

const credential = () => ({ userId: randomUUID(), credentialVersion: 'a'.repeat(64) });
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
  const binding = credential();
  const key = `${config.REDIS_KEY_PREFIX}pwreset-v2-user:${binding.userId}`;
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
    tokens = await Promise.all([store.issue(binding), store.issue(binding)]);
  } finally {
    spy.mockRestore();
  }
  const live = await Promise.all(tokens.map(({ token }) => store.peek(token)));
  expect(live.filter(Boolean)).toHaveLength(1);
});

it('does not lose the current reset pointer when consuming and issuing concurrently', async () => {
  const store = app.get(PasswordResetStore);
  for (let i = 0; i < 10; i++) {
    const binding = credential();
    const previous = await store.issue(binding);
    const [, next] = await Promise.all([
      store.consume(previous.token, binding),
      store.issue(binding),
    ]);
    const newest = await store.issue(binding);
    expect(await store.peek(next.token)).toBeNull();
    expect(await store.peek(newest.token)).toEqual(binding);
    expect(await store.consume(newest.token, binding)).toBe(true);
    expect(await store.consume(newest.token, binding)).toBe(false);
  }
});
