import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  /** PostgreSQL connection string (validated by the caller's environment schema). */
  connectionString: string;
  /** Milliseconds to wait for a new connection before failing. */
  connectionTimeoutMillis?: number;
}

/**
 * Creates a Prisma client backed by the `pg` driver adapter.
 * The client connects lazily: constructing it never blocks or fails when the database is down.
 */
export function createPrismaClient({
  connectionString,
  connectionTimeoutMillis = 5_000,
}: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis });
  return new PrismaClient({ adapter });
}

/**
 * Runs `SELECT 1` — a read-only query that proves the database accepts connections and executes
 * statements, without depending on any table existing.
 */
export async function checkDatabaseConnection(client: PrismaClient): Promise<void> {
  const rows = await client.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
  if (rows[0]?.ok !== 1) {
    throw new Error('Unexpected response from database connectivity check');
  }
}
