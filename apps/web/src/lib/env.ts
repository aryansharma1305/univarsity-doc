import { httpUrl, nodeEnvSchema, parseEnv } from '@docversity/validation';
import { z } from 'zod';

/**
 * Server-side environment for the web app. Nothing here is exposed to the browser
 * (no NEXT_PUBLIC_ variables are used in Phase 1).
 */
export const webEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  /** How the Next.js server reaches the API (server-to-server). */
  API_INTERNAL_URL: httpUrl,
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadWebEnv(source: Record<string, string | undefined> = process.env): WebEnv {
  return parseEnv('web', webEnvSchema, source);
}
