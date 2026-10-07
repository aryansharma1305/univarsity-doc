import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestRoutesModule } from '../support/test-routes.js';
import { browser, createTestApp, createTestUser, errorOf, realConfig, signIn } from '../helpers.js';

let app: INestApplication;
beforeAll(async () => {
  app = await createTestApp(realConfig(), { extraModules: [TestRoutesModule] });
});
afterAll(async () => {
  await app.close();
});

describe('CSRF protection for authenticated mutations', () => {
  it('rejects a mutating request without a token', async () => {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(app);
    await signIn(agent, user);
    const response = await agent.post('/api/v1/test-only/students');
    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe('CSRF_INVALID');
  });

  it('rejects a wrong token, including another session’s valid token', async () => {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const mine = browser(app);
    const theirs = browser(app);
    await signIn(mine, user);
    const otherToken = await signIn(theirs, user);
    await mine.post('/api/v1/test-only/students').set('X-CSRF-Token', 'nope').expect(403);
    await mine.post('/api/v1/test-only/students').set('X-CSRF-Token', otherToken).expect(403);
  });

  it('accepts the session token, which changes when the session changes', async () => {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(app);
    const first = await signIn(agent, user);
    await agent.post('/api/v1/test-only/students').set('X-CSRF-Token', first).expect(200);

    const second = await signIn(agent, user); // re-login rotates the session
    expect(second).not.toBe(first);
    await agent.post('/api/v1/test-only/students').set('X-CSRF-Token', first).expect(403);
    await agent.post('/api/v1/test-only/students').set('X-CSRF-Token', second).expect(200);
  });

  it('does not require a token for safe methods', async () => {
    const user = await createTestUser({ roles: ['VIEWER'] });
    const agent = browser(app);
    await signIn(agent, user);
    await agent.get('/api/v1/test-only/students').expect(200);
  });

  it('rejects mutations from a disallowed Origin even with a valid token', async () => {
    const user = await createTestUser({ roles: ['SUPER_ADMIN'] });
    const agent = browser(app);
    const token = await signIn(agent, user);
    const response = await agent
      .post('/api/v1/test-only/students')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', token);
    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe('ORIGIN_NOT_ALLOWED');
    await agent
      .post('/api/v1/test-only/students')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', token)
      .expect(200);
  });
});
