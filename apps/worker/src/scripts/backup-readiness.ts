import { Queue } from 'bullmq';
import { createPrismaClient } from '@docversity/database';
import { QUEUE_NAMES } from '@docversity/types';
import { assertBackupReady } from '../backup-readiness.ts';
import { bullmqConnection } from '../connection.ts';
import { loadWorkerEnv } from '../env.ts';

// No .env loading: the staging launcher supplies this instance's private worker runtime only.
const deadline = setTimeout(() => {
  console.error('Backup readiness deadline exceeded; no backup may proceed.');
  process.exit(1);
}, 15_000);
const env = loadWorkerEnv();
const db = createPrismaClient({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const queues = Object.values(QUEUE_NAMES).map(
  (name) =>
    new Queue(name, { connection: bullmqConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX }),
);
try {
  await assertBackupReady(queues, () =>
    db.importJob.count({ where: { status: { in: ['UPLOADED', 'VALIDATING', 'PROCESSING'] } } }),
  );
  console.log('Backup readiness passed: no pending queue work or processing imports.');
} catch {
  console.error('Backup readiness failed; inspect and recover this instance before retrying.');
  process.exitCode = 1;
} finally {
  await Promise.all([...queues.map((queue) => queue.close()), db.$disconnect()]);
  clearTimeout(deadline);
}
