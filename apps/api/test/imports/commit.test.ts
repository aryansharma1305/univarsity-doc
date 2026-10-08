import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { type ImportEngine, processImportJob } from '@docversity/imports';
import { buildWorkbook, generatedStudents, studentSheet } from '@docversity/imports/testing';
import type { ObjectStorage } from '@docversity/storage';
import { IMPORT_JOB_NAMES } from '@docversity/types';
import { type ImportJob, importRowListSchema } from '@docversity/validation';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import {
  existingStudent,
  jobOf,
  masterData,
  startImportWorker,
  tag,
  testEngine,
  upload,
  waitForStatus,
  type ImportWorker,
  type MasterData,
} from './support.js';

let app: INestApplication;
let worker: ImportWorker;
const config = realConfig();

beforeAll(async () => {
  app = await createTestApp(config);
  worker = await startImportWorker(config);
});
afterEach(async () => {
  await worker.queue.resume();
});
afterAll(async () => {
  await worker.close();
  await app.close();
});

async function validatedImport(
  registrar: Staff,
  master: MasterData,
  prefix: string,
  count: number,
  extra: object[] = [],
): Promise<ImportJob> {
  const students = [
    ...generatedStudents(count, {
      prefix,
      programCode: master.program.code,
      academicSessionCode: master.session.code,
    }),
    ...extra,
  ];
  const created = jobOf(
    await upload(registrar, await buildWorkbook([studentSheet(students)])).expect(201),
  );
  const mapping = await waitForStatus(registrar, created.id, ['MAPPING']);
  await registrar
    .post(`imports/${created.id}/mapping`, {
      worksheet: 'Students',
      columns: mapping.sheets[0]?.suggestedMapping,
    })
    .expect(200);
  await registrar.post(`imports/${created.id}/validate`).expect(200);
  return waitForStatus(registrar, created.id, ['VALIDATED']);
}

/** Pauses the in-process worker, requests the commit through the API and returns the queued job data. */
async function commitPaused(registrar: Staff, id: string, applyUpdates = false) {
  // Queue-level pause: the commit job is queued but no worker can pick it up.
  await worker.queue.pause();
  await registrar.post(`imports/${id}/commit`, { applyUpdates }).expect(200);
  const queued = (await worker.queue.getJobs(['waiting', 'prioritized', 'delayed'])).find(
    (job) => (job.data as { importJobId?: string }).importJobId === id,
  );
  if (!queued) throw new Error('commit job not queued');
  return queued.data as unknown;
}

const registrationsWith = (prefix: string) =>
  testDb().studentRegistration.count({
    where: { registrationNumberNormalized: { startsWith: prefix } },
  });

describe('student import commit', () => {
  it('is idempotent: duplicate executions of the same commit job create each record once', async () => {
    const master = await masterData();
    const prefix = `IDEM-${tag()}`;
    const registrar = await staff(app, ['REGISTRAR']);
    const job = await validatedImport(registrar, master, prefix, 12);
    const data = await commitPaused(registrar, job.id);

    const engine = testEngine(config, { limits: { ...config, IMPORT_BATCH_SIZE: 5 } });
    const attempt = { attemptsMade: 0, attempts: 3 };
    // Two deliveries at the same time (e.g. a stalled job re-delivered): row locks serialise them.
    const results = await Promise.all([
      processImportJob(engine, IMPORT_JOB_NAMES.commit, data, attempt),
      processImportJob(engine, IMPORT_JOB_NAMES.commit, data, attempt),
    ]);
    expect(results.sort()).toEqual(['completed', 'stale']);
    expect(await registrationsWith(prefix)).toBe(12);

    // A third, late delivery (the queued BullMQ job) is a harmless no-op.
    await worker.queue.resume();
    expect(await processImportJob(engine, IMPORT_JOB_NAMES.commit, data, attempt)).toBe('stale');
    const done = await waitForStatus(registrar, job.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ imported: 12, created: 12 });
    expect(await registrationsWith(prefix)).toBe(12);
    expect(
      await testDb().auditLog.count({
        where: { action: 'STUDENT_IMPORT_COMMITTED', entityId: job.id },
      }),
    ).toBe(1);
  });

  it('rolls back a failing batch, fails retryably, and resumes on retry without duplicates', async () => {
    const master = await masterData();
    const prefix = `RB-${tag()}`;
    const registrar = await staff(app, ['REGISTRAR']);
    const job = await validatedImport(registrar, master, prefix, 6);
    // Corrupt one staged row so its INSERT fails inside the database (name longer than the column).
    const target = await testDb().importRow.findFirstOrThrow({
      where: { importJobId: job.id, rowNumber: 5 },
    });
    const original = target.normalizedData as Prisma.JsonObject;
    const normalized = structuredClone(original);
    (normalized.values as Prisma.JsonObject).fullName = 'x'.repeat(300);
    await testDb().importRow.update({
      where: { id: target.id },
      data: { normalizedData: normalized },
    });

    const data = await commitPaused(registrar, job.id);
    const engine = testEngine(config, { limits: { ...config, IMPORT_BATCH_SIZE: 2 } });
    // Final attempt: the error propagates (BullMQ would record it) and the import is marked FAILED.
    await expect(
      processImportJob(engine, IMPORT_JOB_NAMES.commit, data, { attemptsMade: 2, attempts: 3 }),
    ).rejects.toThrow();
    const failed = jobOf(await registrar.get(`imports/${job.id}`).expect(200));
    expect(failed.status).toBe('FAILED');
    expect(failed.failure).toMatchObject({
      stage: 'COMMIT',
      code: 'SYSTEM_ERROR',
      retryable: true,
    });
    expect(failed.failure?.message).not.toMatch(/prisma|varchar|stack|column/i);
    expect(failed.actions.retry).toBe(true);

    // Batch 1 (rows 2–3) committed; batch 2 (rows 4–5) rolled back completely — row 4 too.
    const statuses = await testDb().importRow.findMany({
      where: { importJobId: job.id },
      orderBy: { rowNumber: 'asc' },
      select: { rowNumber: true, status: true },
    });
    expect(statuses.map((row) => [row.rowNumber, row.status])).toEqual([
      [2, 'IMPORTED'],
      [3, 'IMPORTED'],
      [4, 'VALID'],
      [5, 'VALID'],
      [6, 'VALID'],
      [7, 'VALID'],
    ]);
    expect(await registrationsWith(prefix)).toBe(2);

    // Fix the cause, retry explicitly: the commit continues with the remaining rows only.
    await testDb().importRow.update({
      where: { id: target.id },
      data: { normalizedData: original },
    });
    await worker.queue.resume();
    const retried = jobOf(await registrar.post(`imports/${job.id}/retry`).expect(200));
    expect(retried.status).toBe('PROCESSING');
    const done = await waitForStatus(registrar, job.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ imported: 6, created: 6, errors: 0 });
    expect(await registrationsWith(prefix)).toBe(6);
    expect(
      await testDb().auditLog.count({
        where: { action: 'STUDENT_IMPORT_RETRIED', entityId: job.id },
      }),
    ).toBe(1);
  });

  it('retries transient failures; the last failed attempt leaves a retryable FAILED import', async () => {
    const master = await masterData();
    const prefix = `TR-${tag()}`;
    const registrar = await staff(app, ['REGISTRAR']);
    const job = await validatedImport(registrar, master, prefix, 3, [
      {
        registrationNumber: `${prefix}-BAD`,
        fullName: 'Test',
        programCode: 'NOPE',
        academicSessionCode: master.session.code,
      },
    ]);
    const data = await commitPaused(registrar, job.id);
    const real = testEngine(config);
    const brokenStorage: ObjectStorage = {
      ...real.storage,
      ping: () => real.storage.ping(),
      getObject: (key, options) => real.storage.getObject(key, options),
      deleteObject: (key) => real.storage.deleteObject(key),
      putObject: () => Promise.reject(new Error('storage temporarily down')),
    };
    const engine: ImportEngine = { ...real, storage: brokenStorage };
    // A non-final attempt rethrows (BullMQ retries) and leaves the import PROCESSING.
    await expect(
      processImportJob(engine, IMPORT_JOB_NAMES.commit, data, { attemptsMade: 0, attempts: 3 }),
    ).rejects.toThrow('storage temporarily down');
    expect(jobOf(await registrar.get(`imports/${job.id}`).expect(200)).status).toBe('PROCESSING');
    expect(await registrationsWith(prefix)).toBe(3);
    await expect(
      processImportJob(engine, IMPORT_JOB_NAMES.commit, data, { attemptsMade: 2, attempts: 3 }),
    ).rejects.toThrow();
    expect(jobOf(await registrar.get(`imports/${job.id}`).expect(200)).status).toBe('FAILED');

    await worker.queue.resume();
    await registrar.post(`imports/${job.id}/retry`).expect(200);
    const done = await waitForStatus(registrar, job.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ imported: 3, created: 3, errors: 1 });
    expect(done.hasErrorReport).toBe(true);
    expect(await registrationsWith(prefix)).toBe(3);
  });

  it('re-checks every row against the current database at commit time', async () => {
    const master = await masterData();
    const prefix = `RC-${tag()}`;
    const registrar = await staff(app, ['REGISTRAR']);
    const existing = await existingStudent(master, `${prefix}-UPD`, { fullName: 'Test Before' });
    const job = await validatedImport(registrar, master, prefix, 3, [
      {
        registrationNumber: `${prefix}-UPD`,
        fullName: 'Test After',
        programCode: master.program.code,
        academicSessionCode: master.session.code,
      },
    ]);
    expect(job.counts).toMatchObject({ create: 3, update: 1 });

    // After validation: someone registers 0002 manually, and edits the record row 5 would update.
    await existingStudent(master, `${prefix}-0002`, { fullName: 'Test Manual Entry' });
    await testDb().student.update({
      where: { id: existing.id },
      data: { fullName: 'Test Edited Meanwhile' },
    });

    await registrar.post(`imports/${job.id}/commit`, { applyUpdates: true }).expect(200);
    const done = await waitForStatus(registrar, job.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ imported: 2, created: 2, updated: 0, errors: 2 });
    const errors = importRowListSchema.parse(
      (await registrar.get(`imports/${job.id}/rows?filter=errors`).expect(200)).body,
    );
    expect(
      errors.data.map((row) => [row.rowNumber, row.issues.map((issue) => issue.code)]),
    ).toEqual([
      [3, ['REGISTRATION_ALREADY_EXISTS']],
      [5, ['RECORD_CHANGED_SINCE_VALIDATION']],
    ]);
    // The manual record and the concurrent edit are untouched.
    const manual = await testDb().studentRegistration.findFirstOrThrow({
      where: { registrationNumberNormalized: `${prefix}-0002` },
      include: { student: true },
    });
    expect(manual.student.fullName).toBe('Test Manual Entry');
    expect(
      (await testDb().student.findUniqueOrThrow({ where: { id: existing.id } })).fullName,
    ).toBe('Test Edited Meanwhile');
  });

  it('turns rows into errors when master data changes after validation (shared relation rules)', async () => {
    const master = await masterData();
    const prefix = `MD-${tag()}`;
    const registrar = await staff(app, ['REGISTRAR']);
    const job = await validatedImport(registrar, master, prefix, 2);
    await testDb().program.update({
      where: { id: master.program.id },
      data: { status: 'INACTIVE' },
    });
    await registrar.post(`imports/${job.id}/commit`, {}).expect(200);
    const done = await waitForStatus(registrar, job.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ imported: 0, errors: 2 });
    const rows = importRowListSchema.parse(
      (await registrar.get(`imports/${job.id}/rows`).expect(200)).body,
    );
    expect(rows.data.map((row) => row.issues[0]?.code)).toEqual([
      'INACTIVE_PROGRAM',
      'INACTIVE_PROGRAM',
    ]);
    expect(await registrationsWith(prefix)).toBe(0);
  });

  it('skips unapproved updates and refuses a commit with nothing to import', async () => {
    const master = await masterData();
    const prefix = `NU-${tag()}`;
    await existingStudent(master, `${prefix}-0001`, { fullName: 'Test Old Name' });
    const registrar = await staff(app, ['REGISTRAR']);
    const job = await validatedImport(registrar, master, prefix, 1);
    expect(job.counts).toMatchObject({ create: 0, update: 1 });
    const refused = await registrar
      .post(`imports/${job.id}/commit`, { applyUpdates: false })
      .expect(400);
    expect(
      (refused.body as { error: { details: { message: string }[] } }).error.details[0]?.message,
    ).toMatch(/Approve the updates/);
    await registrar.post(`imports/${job.id}/commit`, { applyUpdates: true }).expect(200);
    const done = await waitForStatus(registrar, job.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ updated: 1 });
  });
});
