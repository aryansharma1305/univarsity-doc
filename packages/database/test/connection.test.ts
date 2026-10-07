import { afterAll, describe, expect, it } from 'vitest';
import { checkDatabaseConnection, createPrismaClient, type PrismaClient } from '../src/index.js';
import { loadRootEnv } from './load-env.js';

loadRootEnv();

describe('Prisma client (integration — requires `docker compose up -d`)', () => {
  const connectionString = process.env.DATABASE_URL;
  let client: PrismaClient | undefined;

  afterAll(async () => {
    await client?.$disconnect();
  });

  it('has DATABASE_URL configured', () => {
    expect(connectionString, 'DATABASE_URL must be set (see .env.example)').toBeTruthy();
  });

  it('connects to PostgreSQL and executes SELECT 1', async () => {
    client = createPrismaClient({ connectionString: connectionString ?? '' });
    await expect(checkDatabaseConnection(client)).resolves.toBeUndefined();
  });

  it('reports failure when the database is unreachable', async () => {
    const unreachable = createPrismaClient({
      connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      connectionTimeoutMillis: 1_000,
    });
    try {
      await expect(checkDatabaseConnection(unreachable)).rejects.toThrow();
    } finally {
      await unreachable.$disconnect();
    }
  });
});
