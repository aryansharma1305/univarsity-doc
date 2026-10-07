import type { SchemaObject } from '@nestjs/swagger';
import type { z } from 'zod';

/**
 * OpenAPI schema for a request body, generated from the shared Zod schema (never hand-written).
 * Swagger's `@ApiBody` does not accept Standard Schema directly, so the Zod-generated definition is
 * inlined here.
 */
export function openApiRequestSchema(schema: z.ZodType): SchemaObject {
  const standard = schema['~standard'] as unknown as {
    jsonSchema: { input: (options: { target: string }) => Record<string, unknown> };
  };
  const generated = standard.jsonSchema.input({ target: 'openapi-3.0' });
  const ref = typeof generated.$ref === 'string' ? generated.$ref.split('/').pop() : undefined;
  const definitions = generated.definitions as Record<string, SchemaObject> | undefined;
  if (ref && definitions?.[ref]) return definitions[ref];
  const { $schema: _schema, definitions: _defs, ...inline } = generated;
  return inline;
}
