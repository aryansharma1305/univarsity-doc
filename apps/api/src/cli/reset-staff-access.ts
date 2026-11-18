/**
 * Break-glass staff access reset — for when no SUPER_ADMIN can sign in (otherwise use the audited
 * SUPER_ADMIN action POST /api/v1/staff-users/:id/access-reset).
 *
 *   pnpm staff:reset-access                         interactive: email + hidden temporary password
 *   STAFF_EMAIL=… STAFF_TEMP_PASSWORD=… pnpm staff:reset-access   non-interactive
 *
 * Removes the authenticator and recovery codes, sets the temporary password and requires a new one at
 * next sign-in. All existing sessions stop working (they are bound to the password hash). Never prints
 * the password. Email reset stays disabled; hand the temporary password over out of band.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@docversity/database';
import { CreateAdminError } from './create-admin-core.js';
import { prompt, promptHidden } from './prompt.js';
import { resetStaffAccess } from './reset-staff-access-core.js';

const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new CreateAdminError('DATABASE_URL is not set (see .env.example).');
  const email = process.env.STAFF_EMAIL ?? (await prompt('Staff email: '));
  let temporaryPassword = process.env.STAFF_TEMP_PASSWORD;
  if (temporaryPassword === undefined) {
    const hint = 'set STAFF_TEMP_PASSWORD instead.';
    temporaryPassword = await promptHidden('Temporary password (input hidden): ', hint);
    if (temporaryPassword !== (await promptHidden('Confirm temporary password: ', hint))) {
      throw new CreateAdminError('Passwords do not match.');
    }
  }
  const db = createPrismaClient({ connectionString: databaseUrl });
  try {
    const result = await resetStaffAccess(db, { email, temporaryPassword });
    console.log(
      `Reset access for ${result.email} (id ${result.id}): authenticator ${
        result.mfaWasEnabled ? 'removed' : 'was not set up'
      }, temporary password set, new password required at next sign-in.`,
    );
    if (result.status !== 'ACTIVE')
      console.log('Note: this account is DISABLED and stays disabled.');
    if (process.env.STAFF_TEMP_PASSWORD !== undefined) {
      console.log(
        'STAFF_TEMP_PASSWORD was read from the environment — clear it from your shell history.',
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof CreateAdminError ? error.message : 'Failed to reset staff access.',
  );
  process.exitCode = 1;
});
