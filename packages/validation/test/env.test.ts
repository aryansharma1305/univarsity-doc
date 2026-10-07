import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EnvValidationError,
  envBoolean,
  parseEnv,
  redisEnvSchema,
  storageEnvSchema,
} from '../src/index.js';

describe('parseEnv', () => {
  it('returns typed values when the environment is valid', () => {
    const env = parseEnv('test', redisEnvSchema, { REDIS_URL: 'redis://localhost:6379' });
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('fails fast and names the missing variable without echoing values', () => {
    const run = () =>
      parseEnv('api', storageEnvSchema, { S3_REGION: 'auto', S3_SECRET_KEY: 'super-secret' });
    expect(run).toThrow(EnvValidationError);
    expect(run).toThrow(/S3_BUCKET/);
    expect(run).not.toThrow(/super-secret/);
  });

  it('treats empty strings as missing', () => {
    expect(() => parseEnv('test', redisEnvSchema, { REDIS_URL: '' })).toThrow(/REDIS_URL/);
  });
});

describe('envBoolean', () => {
  const schema = z.object({ FLAG: envBoolean });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('parses %s as %s', (raw, expected) => {
    expect(schema.parse({ FLAG: raw }).FLAG).toBe(expected);
  });

  it('rejects ambiguous values instead of coercing them', () => {
    expect(schema.safeParse({ FLAG: 'yes' }).success).toBe(false);
  });
});
