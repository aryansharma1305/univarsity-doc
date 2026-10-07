import type { ConnectionOptions } from 'bullmq';

/**
 * BullMQ connection options for a Redis URL.
 * `maxRetriesPerRequest: null` is required by BullMQ for blocking commands used by workers.
 */
export function bullmqConnection(redisUrl: string): ConnectionOptions {
  return { url: redisUrl, maxRetriesPerRequest: null };
}
