import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../../src/audit/audit.service.js';
import {
  browser,
  createTestApp,
  createTestUser,
  csrfToken,
  realConfig,
  signIn,
  testDb,
} from '../helpers.js';

let app: INestApplication;
beforeAll(async () => {
  app = await createTestApp(realConfig());
});
afterAll(async () => {
  await app.close();
});

describe('auth audit trail', () => {
  it('records a successful login with the request correlation ID', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const token = await csrfToken(agent);
    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .set('X-Request-Id', 'test-correlation-0001')
      .set(
        'User-Agent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
      )
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(response.headers['x-request-id']).toBe('test-correlation-0001');
    const entry = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'AUTH_LOGIN_SUCCESS', entityId: user.id },
    });
    expect(entry.actorUserId).toBe(user.id);
    expect(entry.correlationId).toBe('test-correlation-0001');
    expect(entry.metadata).toMatchObject({ device: 'Chrome on macOS' });
    // Only a coarse device summary is kept, never the raw User-Agent string.
    expect(JSON.stringify(entry.metadata)).not.toContain('AppleWebKit');
  });

  it('records failed logins safely: no password, no raw email or IP', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const token = await csrfToken(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: user.email, password: 'the wrong password value' })
      .expect(401);
    const entry = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'AUTH_LOGIN_FAILURE', entityId: user.id },
    });
    expect(entry.actorUserId).toBeNull();
    expect(entry.metadata).toMatchObject({ reason: 'invalid_password' });
    const stored = JSON.stringify(entry);
    expect(stored).not.toContain('the wrong password value');
    expect(stored).not.toContain(user.email);
    expect(stored).not.toContain('127.0.0.1');
  });

  it('records failures for unknown accounts without storing the email', async () => {
    const agent = browser(app);
    const token = await csrfToken(agent);
    const email = 'ghost.account@example.test';
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email, password: 'x' })
      .expect(401);
    const entries = await testDb().auditLog.findMany({
      where: { action: 'AUTH_LOGIN_FAILURE', entityId: null },
    });
    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).not.toContain(email);
  });

  it('records logout', async () => {
    const user = await createTestUser();
    const agent = browser(app);
    const csrf = await signIn(agent, user);
    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf).expect(200);
    const entry = await testDb().auditLog.findFirst({
      where: { action: 'AUTH_LOGOUT', actorUserId: user.id },
    });
    expect(entry).not.toBeNull();
  });

  it('offers no way to modify audit entries, and the database refuses to', async () => {
    const service: object = app.get(AuditService);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(service))).toEqual([
      'constructor',
      'writeAuditEvent',
    ]);
    const entry = await testDb().auditLog.create({ data: { action: 'TEST', entityType: 'Test' } });
    await expect(
      testDb().auditLog.update({ where: { id: entry.id }, data: { action: 'X' } }),
    ).rejects.toThrow();
    await expect(testDb().auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
  });

  it('redacts sensitive metadata keys before writing', async () => {
    await app.get(AuditService).writeAuditEvent({
      action: 'AUTH_PASSWORD_CHANGED',
      entityType: 'Test',
      entityId: 'redaction-check',
      metadata: { password: 'plain', nested: { resetToken: 'abc' }, harmless: 'kept' },
    });
    const entry = await testDb().auditLog.findFirstOrThrow({
      where: { entityId: 'redaction-check' },
    });
    expect(entry.metadata).toEqual({
      password: '[REDACTED]',
      nested: { resetToken: '[REDACTED]' },
      harmless: 'kept',
    });
  });
});
