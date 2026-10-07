import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@docversity/validation';
import type { ApiConfig } from '../src/config/api-config.js';
import { CLOSED_PORT_HOST, createTestApp, healthOf, http, realConfig } from './helpers.js';

/**
 * Proves the health endpoint is not faked: each dependency is pointed at something that cannot
 * answer, and the endpoint must report exactly that dependency as failed with HTTP 503.
 */
describe('GET /health when a dependency is unavailable', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function healthWith(overrides: Partial<ApiConfig>) {
    app = await createTestApp(realConfig({ HEALTH_CHECK_TIMEOUT_MS: 1_500, ...overrides }));
    const response = await http(app).get('/health');
    return { status: response.status, body: healthResponseSchema.parse(response.body) };
  }

  it('reports database error when PostgreSQL is unreachable', async () => {
    const response = await healthWith({
      DATABASE_URL: `postgresql://nobody:nothing@${CLOSED_PORT_HOST}/none`,
    });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      services: { api: 'ok', database: 'error', redis: 'ok', storage: 'ok' },
    });
  });

  it('reports redis error when Redis is unreachable', async () => {
    const response = await healthWith({ REDIS_URL: `redis://${CLOSED_PORT_HOST}` });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      services: { api: 'ok', database: 'ok', redis: 'error', storage: 'ok' },
    });
  });

  it('reports storage error when the S3 endpoint is unreachable', async () => {
    const response = await healthWith({ S3_ENDPOINT: `http://${CLOSED_PORT_HOST}` });
    expect(response.status).toBe(503);
    expect(response.body.services).toEqual({
      api: 'ok',
      database: 'ok',
      redis: 'ok',
      storage: 'error',
    });
  });

  it('reports storage error when credentials are wrong (endpoint reachable)', async () => {
    const response = await healthWith({ S3_SECRET_KEY: 'definitely-not-the-secret' });
    expect(response.status).toBe(503);
    expect(healthOf(response).services.storage).toBe('error');
  });

  it('reports storage error when the bucket does not exist', async () => {
    const response = await healthWith({ S3_BUCKET: 'docversity-missing-bucket' });
    expect(response.status).toBe(503);
    expect(healthOf(response).services.storage).toBe('error');
  });
});
