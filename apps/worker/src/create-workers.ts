import { Worker, type WorkerOptions } from 'bullmq';
import { QUEUE_NAMES } from '@docversity/types';
import { bullmqConnection } from './connection.ts';
import { processSystemJob } from './processors.ts';

export interface CreateWorkersOptions {
  redisUrl: string;
  concurrency: number;
  /** Key prefix in Redis; tests use a unique prefix so they never touch a running dev worker. */
  prefix?: string;
}

/** Creates every queue worker this process runs. Phase 1 runs only the infrastructure queue. */
export function createWorkers({ redisUrl, concurrency, prefix }: CreateWorkersOptions): Worker[] {
  const options: WorkerOptions = {
    connection: bullmqConnection(redisUrl),
    concurrency,
    ...(prefix ? { prefix } : {}),
  };
  return [new Worker(QUEUE_NAMES.system, processSystemJob, options)];
}
