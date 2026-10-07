import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@docversity/validation';
import { createTestApp, http, realConfig } from './helpers.js';

describe('GET /health with all dependencies running (requires `docker compose up -d`)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(realConfig());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 and reports every service ok', async () => {
    const response = await http(app).get('/health').expect(200);

    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      services: { api: 'ok', database: 'ok', redis: 'ok', storage: 'ok' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('sends baseline security headers', async () => {
    const response = await http(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('does not serve the health check under the versioned business prefix', async () => {
    await http(app).get('/api/v1/health').expect(404);
  });
});
