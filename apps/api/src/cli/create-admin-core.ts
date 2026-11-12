import type { PrismaClient } from '@docversity/database';
import { AUDIT_ACTIONS, ROLE_NAMES } from '@docversity/types';
import { emailSchema, passwordPolicyViolations } from '@docversity/validation';
import { PasswordService } from '../auth/password.service.js';
import { ensureRoles } from './roles.js';

export interface CreateAdminInput {
  email: string;
  displayName: string;
  password: string;
  role?: BootstrapRole;
}

export class CreateAdminError extends Error {}

export type BootstrapRole = 'SUPER_ADMIN' | 'REGISTRAR' | 'EXAM_ADMIN';

/** The operator CLI supports only the three individually authorized launch roles. */
export function parseBootstrapRole(args: readonly string[]): BootstrapRole {
  if (args.length === 0) return ROLE_NAMES.superAdmin;
  const role = args[1];
  if (
    args.length === 2 &&
    args[0] === '--role' &&
    (role === ROLE_NAMES.superAdmin ||
      role === ROLE_NAMES.registrar ||
      role === ROLE_NAMES.examAdmin)
  ) {
    return role;
  }
  throw new CreateAdminError('Use no arguments, or --role SUPER_ADMIN, REGISTRAR or EXAM_ADMIN.');
}

export function parseStaffRole(args: readonly string[]): 'REGISTRAR' | 'EXAM_ADMIN' {
  const role = parseBootstrapRole(args);
  if (role === ROLE_NAMES.superAdmin) {
    throw new CreateAdminError('Staff creation requires --role REGISTRAR or EXAM_ADMIN.');
  }
  return role;
}

/**
 * Creates an explicitly scoped staff account (SUPER_ADMIN by default). Refuses duplicates and records an
 * ADMIN_CREATED audit event. Shared by the CLI and its tests.
 */
export async function createAdmin(
  db: PrismaClient,
  input: CreateAdminInput,
  passwords: PasswordService = new PasswordService(),
): Promise<{ id: string; email: string }> {
  const roleName = parseBootstrapRole(['--role', input.role ?? ROLE_NAMES.superAdmin]);
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new CreateAdminError('Enter a valid email address.');
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 120) {
    throw new CreateAdminError('Display name must be 2–120 characters.');
  }
  const problems = passwordPolicyViolations(input.password, { email: email.data, displayName });
  if (problems.length > 0) {
    throw new CreateAdminError(
      `Password rejected: ${problems.map((p) => `password ${p}`).join('; ')}.`,
    );
  }
  if (await db.user.findUnique({ where: { email: email.data } })) {
    throw new CreateAdminError('A user with that email already exists.');
  }

  await ensureRoles(db);
  const passwordHash = await passwords.hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({ where: { name: roleName } });
    const user = await tx.user.create({
      data: {
        email: email.data,
        displayName,
        passwordHash,
        roles: { create: { roleId: role.id } },
      },
    });
    await tx.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.adminCreated,
        entityType: 'User',
        entityId: user.id,
        metadata: { via: 'cli', role: roleName },
      },
    });
    return { id: user.id, email: user.email };
  });
}
