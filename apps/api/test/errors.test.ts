import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestRoutesModule } from './support/test-routes.js';
import {
  browser,
  createTestApp,
  createTestUser,
  errorOf,
  http,
  realConfig,
  signIn,
} from './helpers.js';

let app: INestApplication;
beforeAll(async () => {
  app = await createTestApp(realConfig(), { extraModules: [TestRoutesModule] });
});
afterAll(async () => {
  await app.close();
});

describe('error responses', () => {
  it('maps a DV001 integrity-trigger violation to 409 with a stable code and no SQL details', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const csrf = await signIn(agent, user);
    const response = await agent.post('/api/v1/test-only/tamper-audit').set('X-CSRF-Token', csrf);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'DOMAIN_INTEGRITY_VIOLATION',
        message: 'This change is not allowed for the record in its current state.',
        requestId: String(response.headers['x-request-id']),
      },
    });
    const text = JSON.stringify(response.body);
    expect(text).not.toMatch(/audit_logs|UPDATE|DV001|trigger|P2010/i);
  });

  it('hides internal error details behind a generic 500', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const csrf = await signIn(agent, user);
    const response = await agent.post('/api/v1/test-only/boom').set('X-CSRF-Token', csrf);
    expect(response.status).toBe(500);
    expect(errorOf(response).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });

  it('uses the standard shape for unknown routes and malformed JSON', async () => {
    const notFound = await http(app).get('/api/v1/nothing-here');
    expect(notFound.status).toBe(404); // Nest resolves routes before guards; the API surface is public (Swagger)
    expect(errorOf(notFound).code).toBe('NOT_FOUND');
    const anonymousMissing = await http(app).get('/no-such-route');
    expect(anonymousMissing.status).toBe(404);
    expect(errorOf(anonymousMissing).code).toBe('NOT_FOUND');

    const agent = browser(app);
    const token = (await agent.get('/api/v1/auth/csrf')).body as { csrfToken: string };
    const malformed = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token.csrfToken)
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(malformed.status).toBe(400);
    expect(errorOf(malformed).code).toBe('VALIDATION_FAILED');
  });

  it('echoes a well-formed inbound request ID and replaces a malformed one', async () => {
    const kept = await http(app).get('/health').set('X-Request-Id', 'abc12345-correlation');
    expect(kept.headers['x-request-id']).toBe('abc12345-correlation');
    const replaced = await http(app)
      .get('/health')
      .set('X-Request-Id', 'bad id with spaces <script>');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
