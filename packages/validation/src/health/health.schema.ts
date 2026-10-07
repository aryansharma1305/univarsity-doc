import { z } from 'zod';

/** Status of a single dependency, measured by an actual connectivity check. */
export const serviceStatusSchema = z.enum(['ok', 'error']).meta({
  description: '`ok` only when the dependency answered a real check within the timeout.',
});

/**
 * Response of `GET /health`. This one schema drives the API's OpenAPI document and the web app's
 * parsing of the response, so the contract cannot drift between them.
 */
export const healthResponseSchema = z
  .object({
    status: z.enum(['ok', 'error']).meta({
      description: '`ok` only when every service is `ok`; otherwise `error` (HTTP 503).',
    }),
    services: z.object({
      api: serviceStatusSchema,
      database: serviceStatusSchema,
      redis: serviceStatusSchema,
      storage: serviceStatusSchema,
    }),
  })
  .meta({ id: 'HealthResponse' });

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type HealthServiceName = keyof HealthResponse['services'];
