import type { PrismaClient } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import { emailSchema, passwordPolicyViolations } from '@docversity/validation';
import { PasswordService } from '../auth/password.service.js';
import { CreateAdminError } from './create-admin-core.js';

export interface ResetStaffAccessInput {
  email: string;
  /** Replaces the current password; the person must choose their own at next sign-in. */
  temporaryPassword: string;
}

/**
 * Break-glass recovery for when no SUPER_ADMIN can sign in (lost authenticator AND recovery codes, or
 * a lost password with email reset disabled). Run on the server by an operator:
 * - removes the authenticator secret and every recovery code;
 * - sets a temporary password and the password-change flag;
 * - re-enables nothing: a DISABLED account stays disabled.
 * Every existing session stops working immediately because sessions are bound to the password hash
 * (the AuthGuard compares the binding on every request). Audited as STAFF_ACCESS_RESET (via: cli).
 */
export async function resetStaffAccess(
  db: PrismaClient,
  input: ResetStaffAccessInput,
  passwords: PasswordService = new PasswordService(),
): Promise<{ id: string; email: string; mfaWasEnabled: boolean; status: string }> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new CreateAdminError('Enter a valid email address.');
  const user = await db.user.findUnique({ where: { email: email.data } });
  if (!user) throw new CreateAdminError('No staff account with that email exists.');
  const problems = passwordPolicyViolations(input.temporaryPassword, {
    email: user.email,
    displayName: user.displayName,
  });
  if (problems.length > 0) {
    throw new CreateAdminError(
      `Temporary password rejected: ${problems.map((p) => `password ${p}`).join('; ')}.`,
    );
  }
  const passwordHash = await passwords.hashPassword(input.temporaryPassword);
  const mfaWasEnabled = user.mfaEnabledAt !== null;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangeRequired: true,
        mfaTotpSecretEnc: null,
        mfaTotpLastUsedStep: null,
        mfaEnabledAt: null,
      },
    });
    const codes = await tx.staffMfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.staffAccessReset,
        entityType: 'User',
        entityId: user.id,
        metadata: {
          via: 'cli',
          mfaWasEnabled,
          recoveryCodesRemoved: codes.count,
          temporaryLoginSet: true,
        },
      },
    });
  });
  return { id: user.id, email: user.email, mfaWasEnabled, status: user.status };
}
