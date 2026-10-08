/**
 * Enqueues one `health-test` job and waits for the RUNNING worker (`pnpm dev`) to complete it.
 * Exits 0 on success, 1 on failure or timeout.
 *
 *   pnpm queue:check
 */
import { Queue, QueueEvents } from 'bullmq';
import { QUEUE_NAMES, SYSTEM_JOB_NAMES } from '@docversity/types';
import { HEALTH_TEST_DEFAULT_MESSAGE, healthTestJobResultSchema } from '@docversity/validation';
import { bullmqConnection } from '../connection.ts';
import { loadRootEnv, loadWorkerEnv } from '../env.ts';

const TIMEOUT_MS = 15_000;

// Hard deadline for the whole check. BullMQ connections retry Redis indefinitely by design, so
// without this the script would hang (instead of failing) when Redis is down.
const deadline = setTimeout(() => {
  console.error(
    `Health-test job did not complete within ${TIMEOUT_MS} ms.\n` +
      'Is Redis running (`docker compose up -d --wait`) and is the worker running (`pnpm dev`)?',
  );
  process.exit(1);
}, TIMEOUT_MS);
deadline.unref();

loadRootEnv();
const env = loadWorkerEnv();
const connection = bullmqConnection(env.REDIS_URL);
const queue = new Queue(QUEUE_NAMES.system, { connection, prefix: env.QUEUE_PREFIX });
const events = new QueueEvents(QUEUE_NAMES.system, { connection, prefix: env.QUEUE_PREFIX });

try {
  await events.waitUntilReady();
  const job = await queue.add(
    SYSTEM_JOB_NAMES.healthTest,
    { message: HEALTH_TEST_DEFAULT_MESSAGE },
    { removeOnComplete: 100, removeOnFail: 100 },
  );
  console.log(
    `Enqueued ${job.name}#${job.id ?? '?'} — waiting up to ${TIMEOUT_MS} ms for a worker…`,
  );
  const result = healthTestJobResultSchema.parse(await job.waitUntilFinished(events, TIMEOUT_MS));
  console.log('Completed:', JSON.stringify(result));
  process.exitCode = 0;
} catch (error) {
  console.error(
    `Health-test job did not complete: ${error instanceof Error ? error.message : String(error)}\n` +
      'Is the worker running? Start it with `pnpm dev`.',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await Promise.all([queue.close(), events.close()]);
}
