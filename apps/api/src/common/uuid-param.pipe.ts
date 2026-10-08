import type { PipeTransform } from '@nestjs/common';
import { Errors } from './app-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route `:id` parameters must be UUIDs; anything else is simply "not found". */
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw Errors.notFound();
    return value.toLowerCase();
  }
}
