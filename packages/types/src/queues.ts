/**
 * BullMQ queue and job names shared by producers (API, scripts) and the worker.
 *
 * Phase 1 defines only the infrastructure queue used to prove the queue path works.
 * Product queues (imports, document rendering, …) are added in later phases.
 */
export const QUEUE_NAMES = {
  /** Infrastructure/system jobs only — never business work. */
  system: 'system',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const SYSTEM_JOB_NAMES = {
  healthTest: 'health-test',
} as const;

export type SystemJobName = (typeof SYSTEM_JOB_NAMES)[keyof typeof SYSTEM_JOB_NAMES];
