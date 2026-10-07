import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLOSED_PORT_HOST,
  browser,
  createTestApp,
  createTestUser,
  errorOf,
  healthOf,
  http,
  realConfig,
  signIn,
} from '../helpers.js';

/** Authentication must fail CLOSED when Redis (session storage) is unavailable. */
describe('when Redis is unavailable', () => {
  let healthyApp: INestApplication;
  let brokenApp: INestApplication;
  const prefix = `dvtest:redis-down:`;

  beforeAll(async () => {
    healthyApp = await createTestApp(realConfig({ REDIS_KEY_PREFIX: prefix }));
    brokenApp = await createTestApp(
      realConfig({
        REDIS_KEY_PREFIX: prefix,
        REDIS_URL: `redis://${CLOSED_PORT_HOST}`,
        HEALTH_CHECK_TIMEOUT_MS: 500,
      }),
    );
  });
  afterAll(async () => {
    await healthyApp.close();
    await brokenApp.close();
  });

  it('refuses logins with 503 instead of skipping the session store', async () => {
    const user = await createTestUser();
    const agent = browser(brokenApp);
    const token = (await agent.get('/api/v1/auth/csrf')).body as { csrfToken: string };
    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token.csrfToken)
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(503);
    expect(errorOf(response).code).toBe('AUTH_SERVICE_UNAVAILABLE');
  });

  it('never treats a request with a (previously valid) session cookie as authenticated', async () => {
    const user = await createTestUser();
    const agent = browser(healthyApp);
    await signIn(agent, user);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    const cookie = me.request.cookies;

    const response = await http(brokenApp).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(503);
    expect(response.body).not.toHaveProperty('email');
  });

  it('still reports Redis as failing on /health', async () => {
    const response = await http(brokenApp).get('/health');
    expect(response.status).toBe(503);
    expect(healthOf(response).services.redis).toBe('error');
  });
});
