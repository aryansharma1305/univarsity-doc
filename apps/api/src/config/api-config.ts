import {
  databaseEnvSchema,
  envBoolean,
  logLevelSchema,
  nodeEnvSchema,
  parseEnv,
  port,
  redisEnvSchema,
  storageEnvSchema,
} from '@docversity/validation';
import { z } from 'zod';

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: port.default(4000),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  SWAGGER_ENABLED: envBoolean.default(false),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...storageEnvSchema.shape,
});

export type ApiConfig = z.infer<typeof apiEnvSchema>;

/** Injection token for the validated, immutable API configuration. */
export const API_CONFIG = Symbol('API_CONFIG');

/** Validates process.env and fails fast with a readable error if anything is missing. */
export function loadApiConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return Object.freeze(parseEnv('api', apiEnvSchema, source));
}
