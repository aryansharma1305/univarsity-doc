import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { runCommit, runParse, runValidate, uuidv7 } from '@docversity/imports';
import { buildWorkbook, generatedStudents, studentSheet } from '@docversity/imports/testing';
import { objectKeys } from '@docversity/storage';
import { describe, expect, it } from 'vitest';
import { createTestUser, realConfig, testDb } from '../helpers.js';
import { masterData, tag, testEngine } from './support.js';

const ROWS = 5_000;

/**
 * Non-production performance check: 5,000 generated rows through parse → validate → commit with the
 * real engine, database and object storage. The bounds are deliberately loose — the goal is to catch
 * accidental O(n²) behaviour or memory blow-ups, not to benchmark. Timings are printed for the docs.
 */
describe(`student import performance (${ROWS.toLocaleString('en-US')} rows)`, () => {
  it(
    'parses, validates and commits without super-linear slowdowns',
    { timeout: 300_000 },
    async () => {
      const config = realConfig();
      const engine = testEngine(config);
      const db = testDb();
      const master = await masterData();
      const user = await createTestUser({ roles: ['REGISTRAR'] });
      const prefix = `PERF-${tag()}`;

      const t0 = performance.now();
      const bytes = await buildWorkbook([
        studentSheet(
          generatedStudents(ROWS, {
            prefix,
            programCode: master.program.code,
            academicSessionCode: master.session.code,
          }),
        ),
      ]);
      const generateMs = performance.now() - t0;

      const id = uuidv7();
      const key = objectKeys.importSource(id);
      await engine.storage.putObject(key, bytes, { contentType: 'application/octet-stream' });
      const runId = randomUUID();
      await db.importJob.create({
        data: {
          id,
          type: 'STUDENTS',
          originalFilename: 'performance.xlsx',
          storageKey: key,
          fileSizeBytes: bytes.byteLength,
          status: 'UPLOADED',
          activeRunId: runId,
          createdByUserId: user.id,
        },
      });
      const data = { importJobId: id, runId, actorUserId: user.id, correlationId: null };
      const heapBefore = process.memoryUsage().heapUsed;

      let start = performance.now();
      await runParse(engine, data);
      const parseMs = performance.now() - start;

      const job = await db.importJob.findUniqueOrThrow({ where: { id } });
      const sheets = job.sheets as { suggestedMapping: Record<string, number | null> }[];
      expect(job.status).toBe('MAPPING');
      await db.importJob.update({
        where: { id },
        data: {
          mapping: {
            worksheet: 'Students',
            columns: sheets[0]?.suggestedMapping,
            dateFormat: 'ISO',
          },
          status: 'VALIDATING',
        },
      });
      start = performance.now();
      await runValidate(engine, data);
      const validateMs = performance.now() - start;
      const validated = await db.importJob.findUniqueOrThrow({ where: { id } });
      expect(validated).toMatchObject({
        status: 'VALIDATED',
        totalRows: ROWS,
        createRows: ROWS,
        errorRows: 0,
      });

      await db.importJob.update({ where: { id }, data: { status: 'PROCESSING' } });
      start = performance.now();
      await runCommit(engine, data);
      const commitMs = performance.now() - start;
      const heapAfter = process.memoryUsage().heapUsed;

      const completed = await db.importJob.findUniqueOrThrow({ where: { id } });
      expect(completed).toMatchObject({
        status: 'COMPLETED',
        importedRows: ROWS,
        createdRecords: ROWS,
      });
      expect(
        await db.studentRegistration.count({
          where: { registrationNumberNormalized: { startsWith: prefix } },
        }),
      ).toBe(ROWS);

      const timings = {
        rows: ROWS,
        workbookBytes: bytes.byteLength,
        generateMs: Math.round(generateMs),
        parseMs: Math.round(parseMs),
        validateMs: Math.round(validateMs),
        commitMs: Math.round(commitMs),
        batchSize: config.IMPORT_BATCH_SIZE,
        heapDeltaMb: Math.round((heapAfter - heapBefore) / 1024 / 1024),
      };
      console.log(`[import performance] ${JSON.stringify(timings)}`);
      // Loose, machine-independent ceilings (a quadratic step would blow far past these).
      expect(parseMs).toBeLessThan(60_000);
      expect(validateMs).toBeLessThan(90_000);
      expect(commitMs).toBeLessThan(150_000);
    },
  );
});
