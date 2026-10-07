import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CreateAdminError, createAdmin } from '../../src/cli/create-admin-core.js';
import { testDb } from '../helpers.js';

afterAll(async () => {
  await testDb().$disconnect();
});

const email = () => `admin.${randomUUID().slice(0, 8)}@example.test`;

describe('admin bootstrap (pnpm admin:create)', () => {
  it('creates a SUPER_ADMIN with an Argon2id hash and an ADMIN_CREATED audit entry', async () => {
    const address = email();
    const created = await createAdmin(testDb(), {
      email: address.toUpperCase(),
      displayName: 'Registrar Office',
      password: 'a long admin passphrase 2026',
    });
    const user = await testDb().user.findUniqueOrThrow({
      where: { id: created.id },
      include: { roles: { include: { role: true } } },
    });
    expect(user.email).toBe(address);
    expect(user.roles.map((r) => r.role.name)).toEqual(['SUPER_ADMIN']);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('a long admin passphrase');
    const audit = await testDb().auditLog.findFirst({
      where: { action: 'ADMIN_CREATED', entityId: user.id },
    });
    expect(audit?.metadata).toEqual({ via: 'cli', role: 'SUPER_ADMIN' });
  });

  it('refuses weak passwords', async () => {
    await expect(
      createAdmin(testDb(), { email: email(), displayName: 'Admin', password: 'password1234' }),
    ).rejects.toThrow(CreateAdminError);
    await expect(
      createAdmin(testDb(), { email: email(), displayName: 'Admin', password: 'short' }),
    ).rejects.toThrow(/at least 12/);
  });

  it('refuses duplicate emails', async () => {
    const address = email();
    await createAdmin(testDb(), {
      email: address,
      displayName: 'First',
      password: 'a long admin passphrase 2026',
    });
    await expect(
      createAdmin(testDb(), {
        email: address,
        displayName: 'Second',
        password: 'another long passphrase 9',
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('refuses invalid emails', async () => {
    await expect(
      createAdmin(testDb(), {
        email: 'nope',
        displayName: 'X Y',
        password: 'a long admin passphrase 2026',
      }),
    ).rejects.toThrow(/valid email/);
  });
});
