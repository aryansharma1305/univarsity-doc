import { z } from 'zod';

/**
 * Infrastructure-only job used to prove that BullMQ enqueue → worker → result works end to end.
 * It performs no business work and touches no data.
 */
export const healthTestJobDataSchema = z.object({
  message: z.string().min(1).max(200),
});

export const healthTestJobResultSchema = z.object({
  ok: z.literal(true),
  echo: z.string(),
  length: z.number().int().nonnegative(),
  processedBy: z.literal('docversity-worker'),
});

export type HealthTestJobData = z.infer<typeof healthTestJobDataSchema>;
export type HealthTestJobResult = z.infer<typeof healthTestJobResultSchema>;

export const HEALTH_TEST_DEFAULT_MESSAGE = 'Docversity worker health check';
