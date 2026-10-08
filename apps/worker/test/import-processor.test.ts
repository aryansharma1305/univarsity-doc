import type { Job } from 'bullmq';
import { MemoryObjectStorage } from '@docversity/storage';
import type { PrismaClient } from '@docversity/database';
import { describe, expect, it } from 'vitest';
import { importProcessor } from '../src/create-workers.ts';

const engine = {
  // Never reached: these jobs are rejected before any database access.
  prisma: {} as PrismaClient,
  storage: new MemoryObjectStorage(),
  limits: {
    IMPORT_MAX_FILE_MB: 10,
    IMPORT_MAX_UNCOMPRESSED_MB: 100,
    IMPORT_MAX_ROWS: 10_000,
    IMPORT_MAX_COLUMNS: 50,
    IMPORT_BATCH_SIZE: 250,
  },
};

function job(name: string, data: unknown): Job {
  return { name, data, attemptsMade: 0, opts: { attempts: 3 } } as unknown as Job;
}

describe('imports queue processor', () => {
  it('fails unknown import job names loudly', async () => {
    await expect(importProcessor(engine)(job('import.unknown', {}))).rejects.toThrow(
      /Unknown import job/,
    );
  });

  it('rejects invalid payloads before touching any data', async () => {
    await expect(
      importProcessor(engine)(job('import.parse', { importJobId: 'nope' })),
    ).rejects.toThrow();
  });
});
