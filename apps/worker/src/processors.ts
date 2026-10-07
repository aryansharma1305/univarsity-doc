import type { Job } from 'bullmq';
import { SYSTEM_JOB_NAMES } from '@docversity/types';
import { processHealthTestJob } from './jobs/health-test.processor.ts';

/** Routes jobs on the `system` queue to their processor. Unknown job names fail loudly. */
export function processSystemJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case SYSTEM_JOB_NAMES.healthTest:
      return Promise.resolve(processHealthTestJob(job.data));
    default:
      return Promise.reject(new Error(`Unknown system job "${job.name}"`));
  }
}
