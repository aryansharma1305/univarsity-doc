import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../src/index.js';

describe('healthResponseSchema', () => {
  it('exposes a Standard JSON Schema so the API can generate OpenAPI from it', () => {
    const standard = healthResponseSchema['~standard'] as {
      jsonSchema?: { output?: (options: { target: string }) => Record<string, unknown> };
    };
    const jsonSchema = standard.jsonSchema?.output?.({ target: 'openapi-3.0' });
    // The schema carries an id, so it is emitted as a named definition (→ an OpenAPI component).
    expect(jsonSchema).toMatchObject({
      $ref: '#/definitions/HealthResponse',
      definitions: {
        HealthResponse: {
          type: 'object',
          required: ['status', 'services'],
          additionalProperties: false,
        },
      },
    });
  });

  it('rejects unknown service statuses', () => {
    expect(
      healthResponseSchema.safeParse({
        status: 'ok',
        services: { api: 'ok', database: 'degraded', redis: 'ok', storage: 'ok' },
      }).success,
    ).toBe(false);
  });
});
