import type { PrismaClient } from '@docversity/database';
import { AUDIT_ACTIONS, ROLE_NAMES } from '@docversity/types';
import { emailSchema, passwordPolicyViolations } from '@docversity/validation';
import { PasswordService } from '../auth/password.service.js';
import { ensureRoles } from './roles.js';

export interface CreateAdminInput {
  email: string;
  displayName: string;
  password: string;
}

export class CreateAdminError extends Error {}

/**
 * Creates a SUPER_ADMIN. Validates email and password policy, refuses duplicates, and records an
 * ADMIN_CREATED audit event. Shared by the CLI and its tests.
 */
export async function createAdmin(
  db: PrismaClient,
  input: CreateAdminInput,
  passwords: PasswordService = new PasswordService(),
): Promise<{ id: string; email: string }> {
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
    const role = await tx.role.findUniqueOrThrow({ where: { name: ROLE_NAMES.superAdmin } });
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
        metadata: { via: 'cli', role: ROLE_NAMES.superAdmin },
      },
    });
    return { id: user.id, email: user.email };
  });
}
