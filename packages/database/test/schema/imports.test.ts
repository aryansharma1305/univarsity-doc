import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

/** Phase 5 migration (20261008120000_student_imports): integrity of the import wizard state. */
describe('import jobs and rows (Phase 5)', () => {
  const job = () =>
    db.importJob.create({ data: { type: 'STUDENTS', originalFilename: 'fixture.xlsx' } });

  it('keeps progress, counts, file hash and failure details consistent', async () => {
    const created = await job();
    expect(created).toMatchObject({ progress: 0, applyUpdates: false, failure: null });
    await expectDbError(
      db.importJob.update({ where: { id: created.id }, data: { progress: 101 } }),
      /import_jobs_progress_check/,
    );
    await expectDbError(
      db.importJob.update({ where: { id: created.id }, data: { createRows: -1 } }),
      /import_jobs_phase5_counts_check/,
    );
    await expectDbError(
      db.importJob.update({
        where: { id: created.id },
        data: { fileSha256: 'NOT-A-HASH'.padEnd(64, 'x') },
      }),
      /import_jobs_file_check/,
    );
    // FAILED always carries a failure; nothing else does.
    await expectDbError(
      db.importJob.update({ where: { id: created.id }, data: { status: 'FAILED' } }),
      /import_jobs_failure_check/,
    );
    await expectDbError(
      db.importJob.update({
        where: { id: created.id },
        data: { failure: { stage: 'PARSE', code: 'X', message: 'm', retryable: false } },
      }),
      /import_jobs_failure_check/,
    );
    await db.importJob.update({
      where: { id: created.id },
      data: {
        status: 'FAILED',
        failure: { stage: 'PARSE', code: 'X', message: 'm', retryable: false },
      },
    });
  });

  it('never lets an error row carry an action, and imported rows point at their registration', async () => {
    const created = await job();
    const reg = await f.registration();
    await expectDbError(
      db.importRow.create({
        data: {
          importJobId: created.id,
          rowNumber: 2,
          status: 'ERROR',
          action: 'CREATE',
          rawData: {},
        },
      }),
      /import_rows_action_check/,
    );
    await expectDbError(
      db.importRow.create({
        data: {
          importJobId: created.id,
          rowNumber: 3,
          status: 'IMPORTED',
          action: 'CREATE',
          rawData: {},
        },
      }),
      /import_rows_action_check/,
    );
    await expectDbError(
      db.importRow.create({
        data: {
          importJobId: created.id,
          rowNumber: 4,
          status: 'IMPORTED',
          action: 'SKIP',
          registrationId: reg.id,
          rawData: {},
        },
      }),
      /import_rows_action_check/,
    );
    const imported = await db.importRow.create({
      data: {
        importJobId: created.id,
        rowNumber: 5,
        status: 'IMPORTED',
        action: 'CREATE',
        registrationId: reg.id,
        rawData: {},
      },
    });
    expect(imported.registrationId).toBe(reg.id);
    // Unclassified staging rows (e.g. other import types) are allowed.
    await db.importRow.create({
      data: { importJobId: created.id, rowNumber: 6, status: 'VALID', rawData: {} },
    });
  });
});
