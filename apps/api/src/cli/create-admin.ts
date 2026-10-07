/**
 * Creates the first (or another) SUPER_ADMIN account.
 *
 *   pnpm admin:create                       interactive: prompts, password input is hidden
 *   ADMIN_EMAIL=… ADMIN_DISPLAY_NAME=… ADMIN_PASSWORD=… pnpm admin:create   non-interactive
 *
 * Never prints the password. Refuses weak passwords and existing emails. Nothing in Docversity
 * creates an admin automatically — this explicit command is the only way.
 */
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@docversity/database';
import { CreateAdminError, createAdmin } from './create-admin-core.js';

const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Reads a line from the TTY without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(
        new CreateAdminError(
          'Password prompt needs an interactive terminal; set ADMIN_PASSWORD instead.',
        ),
      );
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new CreateAdminError('Cancelled.'));
          return;
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new CreateAdminError('DATABASE_URL is not set (see .env.example).');

  const email = process.env.ADMIN_EMAIL ?? (await prompt('Admin email: '));
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? (await prompt('Display name: '));
  let password = process.env.ADMIN_PASSWORD;
  if (password === undefined) {
    password = await promptHidden('Password (min 12 characters, input hidden): ');
    const confirmation = await promptHidden('Confirm password: ');
    if (password !== confirmation) throw new CreateAdminError('Passwords do not match.');
  }

  const db = createPrismaClient({ connectionString: databaseUrl });
  try {
    const user = await createAdmin(db, { email, displayName, password });
    console.log(`Created SUPER_ADMIN ${user.email} (id ${user.id}).`);
    if (process.env.ADMIN_PASSWORD !== undefined) {
      console.log(
        'ADMIN_PASSWORD was read from the environment — clear it from your shell history.',
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof CreateAdminError ? error.message : 'Failed to create admin.');
  if (!(error instanceof CreateAdminError)) console.error((error as Error).message);
  process.exitCode = 1;
});
