/**
 * Creates the missing metadata-free student copies of image historical documents (Phase 8
 * hardening). Until a document has its copy, students are told it is being prepared and nothing is
 * served; staff cannot publish it.
 *
 *   pnpm documents:backfill-student-copies             create missing copies
 *   pnpm documents:backfill-student-copies --dry-run   check only: stores and changes nothing
 *
 * Safe to repeat. Originals are only read and must match their recorded SHA-256; copies are new
 * objects under new keys; nothing is deleted except a just-written copy that was not needed.
 * Prints the target database and bucket (never credentials) and one line per document.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@docversity/database';
import { S3ObjectStorage } from '@docversity/storage';
import { databaseEnvSchema, parseEnv, storageEnvSchema } from '@docversity/validation';
import { backfillStudentCopies } from '../historical-documents/student-copy-backfill.js';

const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const { DATABASE_URL } = parseEnv('backfill', databaseEnvSchema, process.env);
  const storageEnv = parseEnv('backfill', storageEnvSchema, process.env);
  const target = new URL(DATABASE_URL);
  console.log(
    `${dryRun ? 'DRY RUN — ' : ''}database ${target.pathname.slice(1)} at ${target.hostname}:${target.port || '5432'}, bucket ${storageEnv.S3_BUCKET}`,
  );

  const db = createPrismaClient({ connectionString: DATABASE_URL });
  try {
    const storage = new S3ObjectStorage({ config: storageEnv, connectTimeoutMs: 5000 });
    const report = await backfillStudentCopies(db, storage, { dryRun });
    for (const item of report.items) console.log(`${item.reference}  ${item.id}  ${item.outcome}`);
    const counts = new Map<string, number>();
    for (const item of report.items) counts.set(item.outcome, (counts.get(item.outcome) ?? 0) + 1);
    const summary = [...counts].map(([outcome, count]) => `${outcome} ${String(count)}`).join(', ');
    console.log(
      `Examined ${String(report.examined)} image document(s) without a student copy${summary ? `: ${summary}` : ''}.`,
    );
    if (report.failed) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Student-copy backfill failed:', (error as Error).message);
  process.exitCode = 1;
});
