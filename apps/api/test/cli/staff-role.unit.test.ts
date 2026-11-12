import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@docversity/database';
import {
  createAdmin,
  parseBootstrapRole,
  parseStaffRole,
  type BootstrapRole,
} from '../../src/cli/create-admin-core.js';

describe('individually scoped staff bootstrap', () => {
  it.each(['REGISTRAR', 'EXAM_ADMIN'])('accepts %s on the staff-only entry point', (role) => {
    expect(parseStaffRole(['--role', role])).toBe(role);
  });

  it.each([[], ['--role', 'SUPER_ADMIN']])(
    'refuses implicit or explicit Super Admin on the staff entry',
    (...args) => {
      expect(() => parseStaffRole(args)).toThrow(/Staff creation requires/);
    },
  );
  it('preserves the existing explicit Super Admin bootstrap default', () => {
    expect(parseBootstrapRole([])).toBe('SUPER_ADMIN');
  });

  it.each(['REGISTRAR', 'EXAM_ADMIN', 'SUPER_ADMIN'])('accepts only explicit %s', (role) => {
    expect(parseBootstrapRole(['--role', role])).toBe(role);
  });

  it.each([
    ['--role'],
    ['REGISTRAR'],
    ['--role', 'APPROVER'],
    ['--role', 'UNKNOWN'],
    ['--role', 'REGISTRAR', '--extra'],
  ])('refuses invalid arguments before credential input or database writes: %j', (...args) => {
    expect(() => parseBootstrapRole(args)).toThrow(/Use no arguments/);
  });

  it.each<BootstrapRole>(['REGISTRAR', 'EXAM_ADMIN'])(
    'creates one %s role link and matching transactional audit without privilege escalation',
    async (role) => {
      const transaction = vi.fn<(work: (tx: unknown) => Promise<unknown>) => Promise<unknown>>();
      const db = {
        role: {
          createMany: vi.fn().mockResolvedValue({ count: 6 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: `role-${role}` }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(
            (input: {
              data: {
                email: string;
                passwordHash: string;
                roles: { create: { roleId: string } };
              };
            }) => Promise.resolve({ id: 'synthetic-user', email: input.data.email }),
          ),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        $transaction: transaction,
      };
      transaction.mockImplementation(async (work) => work(db));
      await createAdmin(db as unknown as PrismaClient, {
        email: 'staff@example.invalid',
        displayName: 'Synthetic Operator',
        password: 'a unique synthetic passphrase for testing',
        role,
      });
      expect(db.role.findUniqueOrThrow).toHaveBeenCalledWith({ where: { name: role } });
      const data = db.user.create.mock.calls[0]?.[0].data;
      expect(data?.roles).toEqual({ create: { roleId: `role-${role}` } });
      expect(data?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'ADMIN_CREATED',
          entityType: 'User',
          entityId: 'synthetic-user',
          metadata: { via: 'cli', role },
        },
      });
      expect(db.$transaction).toHaveBeenCalledOnce();
    },
  );
});
