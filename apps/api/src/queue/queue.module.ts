import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { QUEUE_NAMES } from '@docversity/types';
import { Queue } from 'bullmq';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

/** Injection token for the BullMQ `imports` queue (producer side; the worker consumes it). */
export const IMPORT_QUEUE = Symbol('IMPORT_QUEUE');

@Global()
@Module({
  providers: [
    {
      provide: IMPORT_QUEUE,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) =>
        new Queue(QUEUE_NAMES.imports, {
          // Fail fast instead of buffering commands while Redis is unreachable: the request then
          // reports "temporarily unavailable" and the import stays in a retryable state.
          connection: { url: config.REDIS_URL, enableOfflineQueue: false, maxRetriesPerRequest: 1 },
          prefix: config.QUEUE_PREFIX,
          defaultJobOptions: {
            // Transient failures (database/storage hiccups) are retried with backoff. Problems with
            // the uploaded file are not exceptions and never retried (see @docversity/imports).
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: { age: 24 * 3600, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        }),
    },
  ],
  exports: [IMPORT_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(IMPORT_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
