import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffUserSchema } from '@docversity/validation';
import { StaffUsersService } from '../../src/users/staff-users.service.js';
import {
  type Staff,
  TEST_PASSWORD,
  browser,
  createTestApp,
  createTestUser,
  errorOf,
  realConfig,
  signIn,
  staff,
  testDb,
} from '../helpers.js';

const TEMP = 'Temporary handover phrase 2026!';
let app: INestApplication;
let admin: Staff;
let registrar: Staff;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [admin, registrar] = await Promise.all([staff(app, ['SUPER_ADMIN']), staff(app, ['REGISTRAR'])]);
});
afterAll(async () => {
  await app.close();
});

const email = () => `staff.${randomUUID().slice(0, 8)}@example.test`;

describe('staff account management', () => {
  it('only SUPER_ADMIN may create, change roles or re-enable', async () => {
    const target = await createTestUser({ roles: ['VIEWER'] });
    const body = {
      email: email(),
      displayName: 'Synthetic Staff',
      roles: ['VIEWER'],
      temporaryPassword: TEMP,
    };
    expect((await registrar.post('staff-users', body)).status).toBe(403);
    expect(
      (
        await registrar.agent
          .patch(`/api/v1/staff-users/${target.id}/roles`)
          .set('X-CSRF-Token', registrar.csrf)
          .send({ roles: ['SUPER_ADMIN'] })
      ).status,
    ).toBe(403);
    expect(
      (await registrar.post(`staff-users/${target.id}/enable`, { temporaryPassword: TEMP })).status,
    ).toBe(403);
    // CSRF is required.
    expect((await admin.agent.post('/api/v1/staff-users').send(body)).status).toBe(403);
  });

  it('creates an account that must change its password, without returning or auditing it', async () => {
    const address = email();
    const created = await admin.post('staff-users', {
      email: address,
      displayName: 'Synthetic Registrar',
      roles: ['REGISTRAR', 'EXAM_ADMIN'],
      temporaryPassword: TEMP,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const user = staffUserSchema.parse(created.body);
    expect(user).toMatchObject({
      email: address,
      roles: ['EXAM_ADMIN', 'REGISTRAR'],
      status: 'ACTIVE',
      passwordChangeRequired: true,
      mfaEnabled: false,
    });
    expect(JSON.stringify(created.body)).not.toContain(TEMP);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_CREATED', entityId: user.id },
    });
    expect(audit.metadata).toEqual({
      via: 'api',
      roles: ['EXAM_ADMIN', 'REGISTRAR'],
      // Keys naming a password are redacted by the audit writer.
      passwordChangeRequired: '[REDACTED]',
    });
    expect(JSON.stringify(audit)).not.toContain(TEMP);
    // The new account signs in only into the forced password change.
    const agent = browser(app);
    const csrf = (await agent.get('/api/v1/auth/csrf')).body as { csrfToken: string };
    const login = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf.csrfToken)
      .send({ email: address, password: TEMP });
    expect(login.status).toBe(200);
    expect(JSON.stringify(login.body)).toContain('PASSWORD_CHANGE');
    // Duplicates, weak passwords and unknown roles are refused.
    const again = await admin.post('staff-users', {
      email: address,
      displayName: 'Dup',
      roles: ['VIEWER'],
      temporaryPassword: TEMP,
    });
    expect(again.status).toBe(409);
    expect(
      (
        await admin.post('staff-users', {
          email: email(),
          displayName: 'Weak',
          roles: ['VIEWER'],
          temporaryPassword: 'short',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post('staff-users', {
          email: email(),
          displayName: 'Bad',
          roles: ['ROOT'],
          temporaryPassword: TEMP,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post('staff-users', {
          email: email(),
          displayName: 'None',
          roles: [],
          temporaryPassword: TEMP,
        })
      ).status,
    ).toBe(400);
  });

  it('changes roles of others (applied at once, audited) but never your own', async () => {
    const target = await createTestUser({ roles: ['VIEWER'] });
    const member = browser(app);
    await signIn(member, target);
    expect((await member.get('/api/v1/staff-users')).status).toBe(403);
    const put = (who: Staff, id: string, roles: string[]) =>
      who.agent
        .patch(`/api/v1/staff-users/${id}/roles`)
        .set('X-CSRF-Token', who.csrf)
        .send({ roles });
    const changed = await put(admin, target.id, ['APPROVER', 'VIEWER']);
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(staffUserSchema.parse(changed.body).roles).toEqual(['APPROVER', 'VIEWER']);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'STAFF_ROLES_CHANGED', entityId: target.id },
    });
    expect(audit.metadata).toEqual({ before: ['VIEWER'], after: ['APPROVER', 'VIEWER'] });
    // Same session, new permissions on the next request.
    expect((await member.get('/api/v1/re-exam-payments')).status).toBe(200);
    expect(errorOf(await put(admin, admin.user.id, ['VIEWER'])).message).toMatch(/own roles/);
    expect((await put(admin, randomUUID(), ['VIEWER'])).status).toBe(404);
  });

  it('never removes SUPER_ADMIN from the last active SUPER_ADMIN, even concurrently', async () => {
    const db = testDb();
    const service = app.get(StaffUsersService);
    const parked = await db.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
      select: { id: true },
    });
    const parkedIds = parked.map((item) => item.id);
    await db.user.updateMany({ where: { id: { in: parkedIds } }, data: { status: 'DISABLED' } });
    try {
      for (let round = 0; round < 3; round++) {
        const first = await createTestUser({ roles: ['SUPER_ADMIN'] });
        const second = await createTestUser({ roles: ['SUPER_ADMIN'] });
        const results = await Promise.allSettled([
          service.setRoles(first.id, second.id, ['VIEWER']),
          service.setRoles(second.id, first.id, ['VIEWER']),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({
          code: 'CONFLICT',
          message: 'The last active SUPER_ADMIN must keep the SUPER_ADMIN role.',
        });
        expect(
          await db.user.count({
            where: {
              id: { in: [first.id, second.id] },
              roles: { some: { role: { name: 'SUPER_ADMIN' } } },
            },
          }),
        ).toBe(1);
        await db.user.updateMany({
          where: { id: { in: [first.id, second.id] } },
          data: { status: 'DISABLED' },
        });
      }
    } finally {
      await db.user.updateMany({ where: { id: { in: parkedIds } }, data: { status: 'ACTIVE' } });
    }
  });

  it('re-enables a disabled account with a new temporary password and no old credentials', async () => {
    const target = await createTestUser({ roles: ['VIEWER'] });
    await admin.post(`staff-users/${target.id}/disable`, { reason: 'OTHER' }).expect(200);
    expect(
      (await admin.post(`staff-users/${admin.user.id}/enable`, { temporaryPassword: TEMP })).status,
    ).toBe(409);
    const enabled = await admin.post(`staff-users/${target.id}/enable`, {
      temporaryPassword: TEMP,
    });
    expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
    expect(staffUserSchema.parse(enabled.body)).toMatchObject({
      status: 'ACTIVE',
      passwordChangeRequired: true,
      mfaEnabled: false,
    });
    expect(
      (await admin.post(`staff-users/${target.id}/enable`, { temporaryPassword: TEMP })).status,
    ).toBe(409);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'USER_ENABLED', entityId: target.id },
    });
    expect(JSON.stringify(audit)).not.toContain(TEMP);
    // The old password no longer works.
    const agent = browser(app);
    const csrf = (await agent.get('/api/v1/auth/csrf')).body as { csrfToken: string };
    expect(
      (
        await agent
          .post('/api/v1/auth/login')
          .set('X-CSRF-Token', csrf.csrfToken)
          .send({ email: target.email, password: TEST_PASSWORD })
      ).status,
    ).toBe(401);
  });
});
