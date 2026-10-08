import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import type { z } from 'zod';

/** Documents a list endpoint's query parameters from its Zod schema (no hand-written duplicates). */
export function ApiListQuery(schema: z.ZodType): MethodDecorator {
  const standard = schema['~standard'] as unknown as {
    jsonSchema: { input: (options: { target: string }) => Record<string, unknown> };
  };
  const generated = standard.jsonSchema.input({ target: 'openapi-3.0' });
  const properties = (generated.properties ?? {}) as Record<string, SchemaObject>;
  return applyDecorators(
    ...Object.entries(properties).map(([name, property]) =>
      ApiQuery({ name, required: false, schema: property }),
    ),
  );
}
