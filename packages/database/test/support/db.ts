import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../src/index.js';

/** Prisma client connected to the disposable test database created by global-setup.ts. */
export function createTestClient(): PrismaClient {
  return createPrismaClient({ connectionString: inject('testDatabaseUrl') });
}

/** Short unique suffix so tests can share one database without colliding. */
export function uid(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

/**
 * Asserts that a database operation is rejected, and that the error (or its cause chain) mentions
 * the expected constraint, trigger or Prisma error code.
 */
export async function expectDbError(operation: Promise<unknown>, expected: RegExp): Promise<void> {
  let error: unknown;
  try {
    await operation;
  } catch (caught) {
    error = caught;
  }
  if (error === undefined) {
    throw new Error(`Expected the database to reject the operation (${String(expected)})`);
  }
  const text = describeError(error);
  if (!expected.test(text)) {
    throw new Error(`Database error did not match ${String(expected)}:\n${text}`);
  }
}

function describeError(error: unknown, depth = 0): string {
  if (depth > 5 || error === null || error === undefined) return '';
  if (typeof error !== 'object') return typeof error === 'string' ? error : JSON.stringify(error);
  const record = error as Record<string, unknown>;
  const parts = [
    typeof record.code === 'string' ? `code=${record.code}` : '',
    typeof record.message === 'string' ? record.message : '',
    record.meta ? JSON.stringify(record.meta) : '',
  ];
  return [...parts, describeError(record.cause, depth + 1)].filter(Boolean).join('\n');
}
