import { randomUUID } from 'node:crypto';
import { type ImportEngine, processImportJob } from '@docversity/imports';
import { S3ObjectStorage } from '@docversity/storage';
import { QUEUE_NAMES } from '@docversity/types';
import { type ImportJob, importJobSchema, type ImportStatus } from '@docversity/validation';
import { Queue, Worker } from 'bullmq';
import type { ApiConfig } from '../../src/config/api-config.js';
import { type Staff, testDb } from '../helpers.js';

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * The real import engine, wired like apps/worker does it (test database, MinIO, config limits).
 */
export function testEngine(config: ApiConfig, overrides: Partial<ImportEngine> = {}): ImportEngine {
  return {
    prisma: testDb(),
    storage: new S3ObjectStorage({ config, connectTimeoutMs: 2_000 }),
    limits: config,
    ...overrides,
  };
}

/**
 * An in-process BullMQ worker on the test app's unique queue prefix, running the same processor as
 * apps/worker. Tests can pause it to drive steps by hand.
 */
export async function startImportWorker(config: ApiConfig, engine = testEngine(config)) {
  const connection = { url: config.REDIS_URL, maxRetriesPerRequest: null };
  const worker = new Worker(
    QUEUE_NAMES.imports,
    (job) =>
      processImportJob(engine, job.name, job.data, {
        attemptsMade: job.attemptsMade,
        attempts: job.opts.attempts ?? 1,
      }),
    { connection, prefix: config.QUEUE_PREFIX, concurrency: 1 },
  );
  const queue = new Queue(QUEUE_NAMES.imports, { connection, prefix: config.QUEUE_PREFIX });
  await worker.waitUntilReady();
  return {
    worker,
    queue,
    engine,
    async close() {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    },
  };
}

export type ImportWorker = Awaited<ReturnType<typeof startImportWorker>>;

export function jobOf(response: { body: unknown }): ImportJob {
  return importJobSchema.parse(response.body);
}

export function upload(staff: Staff, bytes: Uint8Array, filename = 'students.xlsx', type = XLSX) {
  return staff.agent
    .post('/api/v1/imports')
    .set('X-CSRF-Token', staff.csrf)
    .field('type', 'STUDENTS')
    .attach('file', Buffer.from(bytes), { filename, contentType: type });
}

/** Polls the import until it reaches one of the statuses (real persisted state, as the UI does). */
export async function waitForStatus(
  staff: Staff,
  id: string,
  statuses: ImportStatus[],
  timeoutMs = 30_000,
): Promise<ImportJob> {
  const deadline = Date.now() + timeoutMs;
  let last: ImportJob | undefined;
  while (Date.now() < deadline) {
    last = jobOf(await staff.get(`imports/${id}`).expect(200));
    if (statuses.includes(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(
    `Import ${id} did not reach ${statuses.join('/')} (last: ${last?.status ?? '?'})`,
  );
}

export interface MasterData {
  department: { id: string; code: string };
  program: { id: string; code: string };
  otherProgram: { id: string; code: string };
  session: { id: string; code: string };
}

/** Fresh master data with unique DEV codes for one test. */
export async function masterData(): Promise<MasterData> {
  const db = testDb();
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const department = await db.department.create({
    data: { code: `DEV-D-${tag}`, name: `Test Department ${tag}` },
  });
  const program = await db.program.create({
    data: { code: `DEV-P-${tag}`, name: `Test Program ${tag}`, departmentId: department.id },
  });
  const otherProgram = await db.program.create({
    data: { code: `DEV-Q-${tag}`, name: `Other Program ${tag}` },
  });
  const session = await db.academicSession.create({
    data: { code: `DEV-S-${tag}`, name: `Test Session ${tag}`, status: 'ACTIVE' },
  });
  return {
    department: { id: department.id, code: department.code },
    program: { id: program.id, code: program.code },
    otherProgram: { id: otherProgram.id, code: otherProgram.code },
    session: { id: session.id, code: session.code },
  };
}

/** An existing student + registration created directly in the database. */
export async function existingStudent(
  master: MasterData,
  registrationNumber: string,
  overrides: { fullName?: string; programId?: string } = {},
): Promise<{ id: string; registrations: { id: string }[] }> {
  return testDb().student.create({
    data: {
      fullName: overrides.fullName ?? 'Test Existing Student',
      fatherName: 'Test Existing Father',
      registrations: {
        create: {
          registrationNumber,
          registrationNumberNormalized: registrationNumber.toUpperCase(),
          programId: overrides.programId ?? master.program.id,
          departmentId: overrides.programId ? null : master.department.id,
          academicSessionId: master.session.id,
          admissionDate: new Date('2026-08-01T00:00:00Z'),
        },
      },
    },
    include: { registrations: true },
  });
}

export function tag(): string {
  return randomUUID().slice(0, 6).toUpperCase();
}

/** Collects a binary response body (supertest does not buffer unknown content types by default). */
export function binaryParser(
  response: unknown,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const stream = response as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
}
