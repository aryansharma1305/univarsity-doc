import { type HealthTestJobResult, healthTestJobDataSchema } from '@docversity/validation';

/**
 * Infrastructure-only job: validates its payload and returns a deterministic result derived only
 * from the input. It exists solely to prove enqueue → process → result works; it has no side effects.
 */
export function processHealthTestJob(data: unknown): HealthTestJobResult {
  const { message } = healthTestJobDataSchema.parse(data);
  return {
    ok: true,
    echo: message,
    length: message.length,
    processedBy: 'docversity-worker',
  };
}
