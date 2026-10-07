import { createWorkers } from './create-workers.ts';
import { loadRootEnv, loadWorkerEnv } from './env.ts';

function log(message: string): void {
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

function main(): void {
  loadRootEnv();
  // Fails fast with a readable message if required variables are missing or malformed.
  const env = loadWorkerEnv();
  const workers = createWorkers({ redisUrl: env.REDIS_URL, concurrency: env.WORKER_CONCURRENCY });

  // While Redis is unavailable BullMQ retries continuously. Log each distinct error once instead
  // of once per retry; the suppression resets when the worker is ready or completes a job.
  let lastError: string | undefined;

  for (const worker of workers) {
    worker.on('ready', () => {
      lastError = undefined;
      log(`queue "${worker.name}" ready (concurrency ${env.WORKER_CONCURRENCY})`);
    });
    worker.on('completed', (job) => {
      lastError = undefined;
      log(`job ${job.name}#${job.id ?? '?'} completed`);
    });
    worker.on('failed', (job, error) => {
      log(`job ${job?.name ?? '?'}#${job?.id ?? '?'} failed: ${error.message}`);
    });
    worker.on('error', (error) => {
      if (error.message === lastError) return;
      lastError = error.message;
      log(`worker error on "${worker.name}": ${error.message} (retrying)`);
    });
  }

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received — finishing active jobs and closing`);
    await Promise.all(workers.map((worker) => worker.close()));
    process.exit(0);
  };
  process.once('SIGINT', (signal) => void shutdown(signal));
  process.once('SIGTERM', (signal) => void shutdown(signal));
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
