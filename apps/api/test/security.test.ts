import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDACTED, redact } from '../src/common/json-logger.js';
import {
  browser,
  createTestApp,
  createTestUser,
  csrfToken,
  realConfig,
  setCookie,
} from './helpers.js';

describe('secrets never reach logs', () => {
  const lines: string[] = [];
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp(realConfig(), { logSink: (line) => lines.push(line) });
  });
  afterAll(async () => {
    await app.close();
  });

  it('logs structured JSON with request IDs but no password, session cookie or CSRF token', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const token = await csrfToken(agent);
    const login = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: user.email, password: user.password })
      .expect(200);
    const session = setCookie(login, 'dv_session')?.split(';')[0]?.split('=')[1] ?? '';
    const sessionCsrf = await csrfToken(agent);
    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', sessionCsrf).expect(200);
    const retryToken = await csrfToken(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', retryToken)
      .send({ email: user.email, password: 'a wrong password attempt' })
      .expect(401);

    expect(lines.length).toBeGreaterThan(0);
    const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const requests = parsed.filter((entry) => entry.msg === 'request');
    expect(requests.length).toBeGreaterThanOrEqual(4);
    expect(requests.every((entry) => typeof entry.requestId === 'string')).toBe(true);

    const all = lines.join('\n');
    for (const secret of [user.password, 'a wrong password attempt', session, token, sessionCsrf]) {
      expect(secret.length).toBeGreaterThan(8);
      expect(all).not.toContain(secret);
    }
  });

  it('redacts sensitive keys at any depth', () => {
    expect(
      redact({
        password: 'x',
        headers: { cookie: 'c', authorization: 'a' },
        sessionId: 's',
        count: 2,
      }),
    ).toEqual({
      password: REDACTED,
      headers: { cookie: REDACTED, authorization: REDACTED },
      sessionId: REDACTED,
      count: 2,
    });
  });
});
