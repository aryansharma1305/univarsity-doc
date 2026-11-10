import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBackupReady } from '../src/backup-readiness.ts';
import { bullmqConnection } from '../src/connection.ts';
import { loadRootEnv, loadWorkerEnv } from '../src/env.ts';

loadRootEnv();
const connection = bullmqConnection(loadWorkerEnv().REDIS_URL);
const queues: Queue[] = [];
afterEach(async () => {
  for (const queue of queues.splice(0)) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
});
function fixture() {
  const prefix = `synthetic-backup-${randomUUID()}`;
  const queue = new Queue('imports', { connection, prefix });
  queues.push(queue);
  return { queue, prefix };
}
const noImports = () => Promise.resolve(0);

describe('backup readiness against an isolated Redis namespace', () => {
  it('accepts empty queues but refuses unfinished imports and database errors', async () => {
    const { queue } = fixture();
    await expect(assertBackupReady([queue], noImports)).resolves.toBeUndefined();
    await expect(assertBackupReady([queue], () => Promise.resolve(1))).rejects.toThrow(/import/);
    await expect(
      assertBackupReady([queue], () => Promise.reject(new Error('synthetic unavailable database'))),
    ).rejects.toThrow();
  });
  it.each([{}, { delay: 60_000 }, { priority: 1 }])(
    'refuses pending work %j without consuming or removing it',
    async (options) => {
      const { queue } = fixture();
      const job = await queue.add('synthetic', {}, options);
      const before = await job.getState();
      const imports = vi.fn(noImports);
      await expect(assertBackupReady([queue], imports)).rejects.toThrow(/Backup refused/);
      expect(await job.getState()).toBe(before);
      expect(await queue.getJob(job.id ?? '')).not.toBeUndefined();
      expect(imports).not.toHaveBeenCalled();
    },
  );
  it('refuses paused work and never resumes the queue', async () => {
    const { queue } = fixture();
    await queue.pause();
    await queue.add('synthetic', {});
    await expect(assertBackupReady([queue], noImports)).rejects.toThrow();
    expect(await queue.isPaused()).toBe(true);
  });
  it('waits for graceful close, preserves work for restart and refuses active/failed jobs', async () => {
    const { queue, prefix } = fixture();
    const events = new QueueEvents('imports', { connection, prefix });
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = new Worker(
      'imports',
      async () => {
        entered();
        await held;
        return 'synthetic';
      },
      { connection, prefix },
    );
    let replacement: Worker | undefined;
    try {
      await events.waitUntilReady();
      const first = await queue.add('synthetic', {});
      await started;
      await expect(assertBackupReady([queue], noImports)).rejects.toThrow(/Backup refused/);
      let closed = false;
      const closing = worker.close().then(() => {
        closed = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(closed).toBe(false);
      const next = await queue.add('after-stop', {});
      release();
      await closing;
      expect(await first.getState()).toBe('completed');
      expect(await next.getState()).toBe('waiting');
      await expect(assertBackupReady([queue], noImports)).rejects.toThrow();
      replacement = new Worker(
        'imports',
        (job) => {
          if (job.name === 'failure') return Promise.reject(new Error('synthetic failure'));
          return Promise.resolve('recovered');
        },
        { connection, prefix },
      );
      await expect(next.waitUntilFinished(events, 5000)).resolves.toBe('recovered');
      await expect(assertBackupReady([queue], noImports)).resolves.toBeUndefined();
      const failed = await queue.add('failure', {});
      await expect(failed.waitUntilFinished(events, 5000)).rejects.toThrow(/synthetic failure/);
      await expect(assertBackupReady([queue], noImports)).rejects.toThrow();
      expect(await failed.getState()).toBe('failed');
    } finally {
      release();
      await Promise.all([worker.close(), replacement?.close(), events.close()]);
    }
  });
  it('fails closed if queue counts are missing or the Redis read fails', async () => {
    await expect(
      assertBackupReady(
        [{ getJobCounts: () => Promise.resolve({}), isPaused: () => Promise.resolve(false) }],
        noImports,
      ),
    ).rejects.toThrow();
    await expect(
      assertBackupReady(
        [
          {
            getJobCounts: () => Promise.reject(new Error('offline')),
            isPaused: () => Promise.resolve(false),
          },
        ],
        noImports,
      ),
    ).rejects.toThrow();
  });
});
