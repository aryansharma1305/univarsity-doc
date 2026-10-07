import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, type Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUE_NAMES, SYSTEM_JOB_NAMES } from '@docversity/types';
import { HEALTH_TEST_DEFAULT_MESSAGE } from '@docversity/validation';
import { bullmqConnection } from '../src/connection.ts';
import { createWorkers } from '../src/create-workers.ts';
import { loadRootEnv, loadWorkerEnv } from '../src/env.ts';

/**
 * End-to-end through real Redis: enqueue → BullMQ worker → result.
 * A unique key prefix isolates this run from any worker started with `pnpm dev`.
 */
describe('BullMQ system queue (integration — requires `docker compose up -d`)', () => {
  loadRootEnv();
  const env = loadWorkerEnv();
  const prefix = `docversity-test-${randomUUID()}`;
  const connection = bullmqConnection(env.REDIS_URL);

  let workers: Worker[];
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    workers = createWorkers({ redisUrl: env.REDIS_URL, concurrency: 1, prefix });
    queue = new Queue(QUEUE_NAMES.system, { connection, prefix });
    events = new QueueEvents(QUEUE_NAMES.system, { connection, prefix });
    await Promise.all([...workers.map((w) => w.waitUntilReady()), events.waitUntilReady()]);
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await Promise.all([...workers.map((w) => w.close()), queue.close(), events.close()]);
  });

  it('enqueues the health-test job and returns the processed result', async () => {
    const job = await queue.add(SYSTEM_JOB_NAMES.healthTest, {
      message: HEALTH_TEST_DEFAULT_MESSAGE,
    });
    await expect(job.waitUntilFinished(events, 10_000)).resolves.toEqual({
      ok: true,
      echo: HEALTH_TEST_DEFAULT_MESSAGE,
      length: HEALTH_TEST_DEFAULT_MESSAGE.length,
      processedBy: 'docversity-worker',
    });
  });

  it('fails jobs with an invalid payload instead of completing them', async () => {
    const job = await queue.add(SYSTEM_JOB_NAMES.healthTest, { message: '' });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow();
  });

  it('fails unknown job names loudly', async () => {
    const job = await queue.add('not-a-real-job', {});
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/Unknown system job/);
  });
});
