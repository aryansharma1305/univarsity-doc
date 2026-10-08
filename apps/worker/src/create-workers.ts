import { type Processor, Worker, type WorkerOptions } from 'bullmq';
import { type ImportEngine, processImportJob } from '@docversity/imports';
import { QUEUE_NAMES } from '@docversity/types';
import { bullmqConnection } from './connection.ts';
import { processSystemJob } from './processors.ts';

export interface CreateWorkersOptions {
  redisUrl: string;
  concurrency: number;
  /** Key prefix in Redis; tests use a unique prefix so they never touch a running dev worker. */
  prefix?: string;
  /** When given, the process also consumes the `imports` queue (Phase 5). */
  imports?: { engine: ImportEngine; concurrency: number };
}

/** BullMQ processor for import steps (parse / validate / commit). */
export function importProcessor(engine: ImportEngine): Processor {
  return (job) =>
    processImportJob(engine, job.name, job.data, {
      attemptsMade: job.attemptsMade,
      attempts: job.opts.attempts ?? 1,
    });
}

/** Creates every queue worker this process runs. */
export function createWorkers({
  redisUrl,
  concurrency,
  prefix,
  imports,
}: CreateWorkersOptions): Worker[] {
  const base: WorkerOptions = {
    connection: bullmqConnection(redisUrl),
    concurrency,
    ...(prefix ? { prefix } : {}),
  };
  const workers = [new Worker(QUEUE_NAMES.system, processSystemJob, base)];
  if (imports) {
    workers.push(
      new Worker(QUEUE_NAMES.imports, importProcessor(imports.engine), {
        ...base,
        concurrency: imports.concurrency,
        // Parsing a large workbook is CPU-bound; a generous lock avoids false "stalled" re-deliveries
        // (which would be harmless — every step is idempotent — but wasteful).
        lockDuration: 120_000,
      }),
    );
  }
  return workers;
}
