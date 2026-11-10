import type { Queue } from 'bullmq';

const unfinished = [
  'wait',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
  'repeat',
  'failed',
] as const;

/** Call only after stopping producers and the worker; this never drains or deletes jobs. */
export async function assertBackupReady(
  queues: readonly Pick<Queue, 'getJobCounts' | 'isPaused'>[],
  unfinishedImports: () => Promise<number>,
): Promise<void> {
  for (const queue of queues) {
    const counts = await queue.getJobCounts(...unfinished);
    if (unfinished.some((state) => counts[state] !== 0) || (await queue.isPaused()))
      throw new Error('Backup refused: queued, active, delayed or failed work requires recovery.');
  }
  if ((await unfinishedImports()) !== 0)
    throw new Error('Backup refused: an import still requires processing or recovery.');
}
