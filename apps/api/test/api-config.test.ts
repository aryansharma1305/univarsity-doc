import { describe, expect, it } from 'vitest';
import { EnvValidationError } from '@docversity/validation';
import { loadApiConfig } from '../src/config/api-config.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'docversity-local',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  CORS_ORIGINS: 'http://localhost:3000, http://127.0.0.1:3000',
};

describe('loadApiConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadApiConfig(validEnv);
    expect(config.API_PORT).toBe(4000);
    expect(config.SWAGGER_ENABLED).toBe(false);
    expect(config.S3_FORCE_PATH_STYLE).toBe(false);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'S3_BUCKET', 'S3_SECRET_KEY', 'CORS_ORIGINS'])(
    'fails fast when %s is missing',
    (name) => {
      const env = Object.fromEntries(Object.entries(validEnv).filter(([key]) => key !== name));
      expect(() => loadApiConfig(env)).toThrow(EnvValidationError);
      expect(() => loadApiConfig(env)).toThrow(name);
    },
  );

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadApiConfig({ ...validEnv, DATABASE_URL: 'mysql://x@y/z' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('allows AWS S3 without an explicit endpoint', () => {
    const { S3_ENDPOINT: _omit, ...withoutEndpoint } = validEnv;
    expect(loadApiConfig(withoutEndpoint).S3_ENDPOINT).toBeUndefined();
  });
});
