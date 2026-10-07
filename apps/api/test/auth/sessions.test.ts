import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionStore } from '../../src/auth/session.store.js';
import { UsersService } from '../../src/users/users.service.js';
import {
  browser,
  createTestApp,
  createTestUser,
  errorOf,
  http,
  realConfig,
  sessionsOf,
  setCookie,
  signIn,
  testDb,
  userOf,
} from '../helpers.js';

let app: INestApplication;
beforeAll(async () => {
  app = await createTestApp(realConfig());
});
afterAll(async () => {
  await app.close();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('sessions', () => {
  it('serves /auth/me only with a valid session', async () => {
    const user = await createTestUser({ roles: ['REGISTRAR'] });
    const agent = browser(app);
    const anonymous = await agent.get('/api/v1/auth/me');
    expect(anonymous.status).toBe(401);
    expect(errorOf(anonymous).code).toBe('AUTH_REQUIRED');

    await signIn(agent, user);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body).toMatchObject({ id: user.id, email: user.email, roles: ['REGISTRAR'] });
    expect(userOf(me).permissions).toContain('students.write');
  });

  it('rejects an unknown or forged session cookie and clears it', async () => {
    const response = await http(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'dv_session=forged-session-value-1234567890');
    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe('AUTH_SESSION_EXPIRED');
    expect(setCookie(response, 'dv_session')).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('logout ends the session; the old cookie no longer works', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const csrf = await signIn(agent, user);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    const cookie = me.request.cookies;

    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf).expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
    // Replaying the captured cookie fails too: the session is gone server-side.
    const replay = await http(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(replay.status).toBe(401);
  });

  it('logout succeeds even without a session', async () => {
    const response = await http(app).post('/api/v1/auth/logout').expect(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('lists own sessions with safe metadata only and revokes one of them', async () => {
    const user = await createTestUser();
    const laptop = browser(app);
    const phone = browser(app);
    const csrf = await signIn(laptop, user);
    await signIn(phone, user);

    const list = await laptop.get('/api/v1/auth/sessions').set('User-Agent', 'x').expect(200);
    const sessions = sessionsOf(list);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    for (const session of sessions) {
      expect(Object.keys(session).sort()).toEqual([
        'createdAt',
        'current',
        'device',
        'expiresAt',
        'id',
        'lastSeenAt',
      ]);
    }
    const laptopCookie = list.request.cookies.split('=')[1] ?? '';
    expect(JSON.stringify(list.body)).not.toContain(laptopCookie);

    const other = sessions.find((s) => !s.current);
    await laptop
      .delete(`/api/v1/auth/sessions/${other?.id ?? ''}`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await phone.get('/api/v1/auth/me').expect(401);
    await laptop.get('/api/v1/auth/me').expect(200);
    await laptop
      .delete('/api/v1/auth/sessions/does-not-exist-123')
      .set('X-CSRF-Token', csrf)
      .expect(404);
  });

  it('revokes all other sessions but keeps the current one', async () => {
    const user = await createTestUser();
    const a = browser(app);
    const b = browser(app);
    const c = browser(app);
    const csrf = await signIn(a, user);
    await signIn(b, user);
    await signIn(c, user);
    await a.delete('/api/v1/auth/sessions').set('X-CSRF-Token', csrf).expect(200);
    await a.get('/api/v1/auth/me').expect(200);
    await b.get('/api/v1/auth/me').expect(401);
    await c.get('/api/v1/auth/me').expect(401);
  });

  it('revokeAllForUser ends every session (used by password reset and disablement)', async () => {
    const user = await createTestUser();
    const a = browser(app);
    const b = browser(app);
    await signIn(a, user);
    await signIn(b, user);
    expect(await app.get(SessionStore).revokeAllForUser(user.id)).toBe(2);
    await a.get('/api/v1/auth/me').expect(401);
    await b.get('/api/v1/auth/me').expect(401);
  });

  it('disabling a user ends their sessions immediately and is audited', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    await signIn(agent, user);
    await app.get(UsersService).disableUser(user.id, null, 'test');
    await agent.get('/api/v1/auth/me').expect(401);
    const entry = await testDb().auditLog.findFirst({
      where: { action: 'USER_DISABLED', entityId: user.id },
    });
    expect(entry?.metadata).toMatchObject({ reason: 'test', sessionsRevoked: 1 });
  });

  it('a user disabled directly in the database is rejected on the next request', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    await signIn(agent, user);
    await testDb().user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    await agent.get('/api/v1/auth/me').expect(401);
  });
});

describe('session expiry', () => {
  it('ends a session after the idle timeout', async () => {
    const shortApp = await createTestApp(
      realConfig({ SESSION_IDLE_TIMEOUT_SECONDS: 1, SESSION_ABSOLUTE_TIMEOUT_SECONDS: 60 }),
    );
    try {
      const user = await createTestUser();
      const agent = browser(shortApp);
      await signIn(agent, user);
      await agent.get('/api/v1/auth/me').expect(200);
      await sleep(1_300);
      const expired = await agent.get('/api/v1/auth/me');
      expect(expired.status).toBe(401);
      expect(errorOf(expired).code).toBe('AUTH_SESSION_EXPIRED');
    } finally {
      await shortApp.close();
    }
  });

  it('ends a session at the absolute lifetime even while it is in use', async () => {
    const shortApp = await createTestApp(
      realConfig({ SESSION_IDLE_TIMEOUT_SECONDS: 2, SESSION_ABSOLUTE_TIMEOUT_SECONDS: 2 }),
    );
    try {
      const user = await createTestUser();
      const agent = browser(shortApp);
      await signIn(agent, user);
      await sleep(1_000);
      await agent.get('/api/v1/auth/me').expect(200); // activity…
      await sleep(1_200);
      await agent.get('/api/v1/auth/me').expect(401); // …does not extend past the absolute limit
    } finally {
      await shortApp.close();
    }
  });
});
