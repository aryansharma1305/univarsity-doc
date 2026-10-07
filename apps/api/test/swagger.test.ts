import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, http, realConfig } from './helpers.js';

describe('OpenAPI documentation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(realConfig());
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents GET /health with schemas generated from the shared Zod contract', async () => {
    const response = await http(app).get('/api/docs/openapi.json').expect(200);
    const document = response.body as OpenAPIObject;

    const operation = document.paths['/health']?.get;
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(['200', '503']));
    expect(operation?.responses['200']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
    });
    expect(document.components?.schemas?.HealthResponse).toMatchObject({
      type: 'object',
      required: ['status', 'services'],
    });
  });

  it('serves the Swagger UI', async () => {
    const response = await http(app).get('/api/docs').redirects(1).expect(200);
    expect(response.text).toContain('swagger-ui');
  });

  it('can be disabled by configuration', async () => {
    const disabled = await createTestApp(realConfig({ SWAGGER_ENABLED: false }));
    try {
      await http(disabled).get('/api/docs/openapi.json').expect(404);
    } finally {
      await disabled.close();
    }
  });
});
