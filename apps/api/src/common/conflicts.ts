import { HttpStatus } from '@nestjs/common';
import { uniqueConstraintName } from '@docversity/database';
import { ERROR_CODES } from '@docversity/validation';
import { AppError, type ErrorDetail } from './app-error.js';

/**
 * Turns a unique-constraint violation into a 409 with a field-level message, so forms can show the
 * problem next to the right field. Anything else is rethrown unchanged (the global filter handles it).
 */
export function rethrowAsFieldConflict(error: unknown, fields: Record<string, ErrorDetail>): never {
  const constraint = uniqueConstraintName(error);
  const detail = constraint ? fields[constraint] : undefined;
  if (detail) {
    throw new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, detail.message, {
      details: [detail],
    });
  }
  throw error;
}

/** 400 with field details for relation problems (e.g. inactive or mismatched program/department). */
export function invalidRelation(path: string, message: string): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.validationFailed, message, {
    details: [{ path, message }],
  });
}

/** Names of the fields whose values differ between two records (for audit metadata — names only). */
export function changedFields<T extends object>(
  before: T,
  after: T,
  fields: readonly (keyof T)[],
): string[] {
  return fields
    .filter((field) => {
      const a = before[field];
      const b = after[field];
      if (a instanceof Date || b instanceof Date) {
        return (a instanceof Date ? a.getTime() : a) !== (b instanceof Date ? b.getTime() : b);
      }
      return a !== b;
    })
    .map(String);
}
