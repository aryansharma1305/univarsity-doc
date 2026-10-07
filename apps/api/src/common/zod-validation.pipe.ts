import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { Errors } from './app-error.js';

/**
 * Validates and parses a request part with a shared Zod schema. Error details contain field paths
 * and messages only — never the submitted values (so passwords can't leak into responses).
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw Errors.validation(
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.') || '(body)',
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
