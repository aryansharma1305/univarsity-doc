import { envBoolean, httpUrl, nodeEnvSchema, parseEnv } from '@docversity/validation';
import { z } from 'zod';

/**
 * Server-side environment for the web app. Nothing here is exposed to the browser
 * (no NEXT_PUBLIC_ variables are used in Phase 1).
 */
export const webEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  /** How the Next.js server reaches the API (server-to-server). */
  API_INTERNAL_URL: httpUrl,
  /** See .env.example: whether a trusted proxy in front of this server sets X-Forwarded-For. */
  WEB_BEHIND_TRUSTED_PROXY: envBoolean.default(false),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadWebEnv(source: Record<string, string | undefined> = process.env): WebEnv {
  return parseEnv('web', webEnvSchema, source);
}
