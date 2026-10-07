import type { z } from 'zod';

export class EnvValidationError extends Error {
  constructor(
    readonly service: string,
    readonly issues: readonly string[],
  ) {
    super(
      `[${service}] Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}\n` +
        'Copy .env.example to .env and fill in the missing values.',
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates environment variables against a schema and fails fast with a readable message.
 * Secret values are never echoed back — only variable names and the rule they broke.
 */
export function parseEnv<TSchema extends z.ZodType>(
  service: string,
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): z.infer<TSchema> {
  // Treat empty strings as unset so `FOO=` in a .env file does not satisfy a required variable.
  const normalised = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = schema.safeParse(normalised);
  if (!result.success) {
    throw new EnvValidationError(
      service,
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
