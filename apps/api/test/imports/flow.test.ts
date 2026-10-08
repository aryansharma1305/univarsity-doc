import type { INestApplication } from '@nestjs/common';
import { buildWorkbook, studentSheet } from '@docversity/imports/testing';
import { importRowDetailSchema, importRowListSchema, type ImportJob } from '@docversity/validation';
import { loadWorkbook } from '@docversity/imports';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, errorOf, realConfig, staff, testDb, type Staff } from '../helpers.js';
import {
  binaryParser,
  existingStudent,
  jobOf,
  masterData,
  startImportWorker,
  tag,
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
afterAll(async () => {
  await worker.close();
  await app.close();
});

/**
 * A realistic mixed workbook:
 *  rows 2–4  new students (CREATE)                   row 5  existing, identical (SKIP)
 *  row 6     existing, corrected name (UPDATE)       row 7  unknown program (ERROR)
 *  row 8     missing name (ERROR)                    row 9  new, DOB empty (CREATE + WARNING)
 */
async function mixedWorkbook(master: MasterData, prefix: string) {
  await existingStudent(master, `${prefix}-0004`, { fullName: 'Test Student Four' });
  await existingStudent(master, `${prefix}-0005`, { fullName: 'Test Student Five' });
  const common = {
    programCode: master.program.code,
    academicSessionCode: master.session.code,
    admissionDate: '2026-08-01',
  };
  return buildWorkbook([
    { name: 'Instructions', rows: [['Fill in the Students sheet']] },
    studentSheet([
      {
        ...common,
        registrationNumber: `${prefix}-0001`,
        fullName: 'Test Student One',
        dateOfBirth: '2004-01-15',
        rollReferenceNumber: `${prefix}-R1`,
      },
      {
        ...common,
        registrationNumber: `${prefix}-0002`,
        fullName: 'Test Student Two',
        dateOfBirth: new Date(Date.UTC(2004, 1, 2)),
        rollReferenceNumber: `${prefix}-R2`,
      },
      {
        ...common,
        registrationNumber: `${prefix}-0003`,
        fullName: 'Test Student Three',
        dateOfBirth: '2004-03-03',
        rollReferenceNumber: `${prefix}-R3`,
      },
      {
        ...common,
        registrationNumber: `${prefix}-0004`.toLowerCase(),
        fullName: 'Test Student Four',
        rollReferenceNumber: null,
      },
      { ...common, registrationNumber: `${prefix}-0005`, fullName: 'Test Student Five Corrected' },
      {
        ...common,
        registrationNumber: `${prefix}-0006`,
        fullName: 'Test Student Six',
        programCode: 'NO-SUCH-PROGRAM',
        dateOfBirth: '2004-06-06',
        rollReferenceNumber: `${prefix}-R6`,
      },
      {
        ...common,
        registrationNumber: `${prefix}-0007`,
        fullName: null,
        dateOfBirth: '2004-07-07',
        rollReferenceNumber: `${prefix}-R7`,
      },
      {
        ...common,
        registrationNumber: `${prefix}-0008`,
        fullName: 'Test Student Eight',
        rollReferenceNumber: `${prefix}-R8`,
      },
    ]),
  ]);
}

async function validated(registrar: Staff, bytes: Uint8Array): Promise<ImportJob> {
  const created = jobOf(await upload(registrar, bytes).expect(201));
  expect(created.status).toBe('UPLOADED');
  const mapping = await waitForStatus(registrar, created.id, ['MAPPING']);
  const sheet = mapping.sheets.find((candidate) => candidate.name === 'Students');
  await registrar
    .post(`imports/${created.id}/mapping`, {
      worksheet: 'Students',
      columns: sheet?.suggestedMapping,
      dateFormat: 'ISO',
    })
    .expect(200);
  await registrar.post(`imports/${created.id}/validate`).expect(200);
  return waitForStatus(registrar, created.id, ['VALIDATED']);
}

describe('student import: upload → map → validate → review → commit', () => {
  it('runs the full flow, imports only valid CREATE rows, and records everything', async () => {
    const master = await masterData();
    const prefix = `FLOW-${tag()}`;
    const registrar = await staff(app, ['REGISTRAR']);

    // Upload → worker reads the workbook → MAPPING with discovered sheets and suggestions.
    const created = jobOf(
      await upload(registrar, await mixedWorkbook(master, prefix), 'mixed students.xlsx').expect(
        201,
      ),
    );
    const mapping = await waitForStatus(registrar, created.id, ['MAPPING']);
    expect(mapping.sheets.map((sheet) => [sheet.name, sheet.rowCount])).toEqual([
      ['Instructions', 0],
      ['Students', 8],
    ]);
    expect(mapping.sheets[1]?.suggestedMapping).toMatchObject({
      registrationNumber: 1,
      fullName: 3,
      status: 13,
    });
    expect(mapping.actions).toMatchObject({
      map: true,
      validate: true,
      commit: false,
      cancel: true,
    });

    // Commit is not possible before validation.
    expect(errorOf(await registrar.post(`imports/${created.id}/commit`, {}).expect(409)).code).toBe(
      'CONFLICT',
    );
    // Validation needs a saved mapping first.
    expect((await registrar.post(`imports/${created.id}/validate`)).status).toBe(400);

    await registrar
      .post(`imports/${created.id}/mapping`, {
        worksheet: 'Students',
        columns: mapping.sheets[1]?.suggestedMapping,
      })
      .expect(200);
    await registrar.post(`imports/${created.id}/validate`).expect(200);
    const job = await waitForStatus(registrar, created.id, ['VALIDATED']);
    expect(job.counts).toEqual({
      total: 8,
      valid: 5,
      warnings: 1,
      errors: 2,
      create: 4,
      update: 1,
      unchanged: 1,
      imported: 0,
      skipped: 0,
      created: 0,
      updated: 0,
    });
    expect(job.hasErrorReport).toBe(true);
    expect(job.progress).toBe(100);

    // Review: filters and row details.
    const rowsOf = async (filter: string) =>
      importRowListSchema.parse(
        (await registrar.get(`imports/${created.id}/rows?filter=${filter}`).expect(200)).body,
      );
    expect((await rowsOf('all')).meta.total).toBe(8);
    expect(
      (await rowsOf('errors')).data.map((row) => [row.rowNumber, row.issues.map((i) => i.code)]),
    ).toEqual([
      [7, ['UNKNOWN_PROGRAM']],
      [8, ['MISSING_STUDENT_NAME']],
    ]);
    expect((await rowsOf('create')).data.map((row) => row.rowNumber)).toEqual([2, 3, 4, 9]);
    expect((await rowsOf('update')).data.map((row) => row.rowNumber)).toEqual([6]);
    expect((await rowsOf('skip')).data.map((row) => row.rowNumber)).toEqual([5]);
    // "Missing roll/reference number" is only a warning for NEW registrations (row 5 already exists).
    expect(
      (await rowsOf('warnings')).data.map((row) => [row.rowNumber, row.issues.map((i) => i.code)]),
    ).toEqual([[9, ['DATE_OF_BIRTH_MISSING']]]);
    expect((await rowsOf('valid')).data.map((row) => row.rowNumber)).toEqual([2, 3, 4, 5, 6]);

    const update = importRowDetailSchema.parse(
      (await registrar.get(`imports/${created.id}/rows/6`).expect(200)).body,
    );
    expect(update).toMatchObject({
      action: 'UPDATE',
      status: 'VALID',
      changes: [
        { field: 'fullName', from: 'Test Student Five', to: 'Test Student Five Corrected' },
      ],
      current: { fullName: 'Test Student Five', programCode: master.program.code },
    });
    expect(update.source.find((cell) => cell.letter === 'C')).toEqual({
      letter: 'C',
      header: 'Student Name',
      value: 'Test Student Five Corrected',
    });
    expect(update.studentId).not.toBeNull();
    const errorRow = importRowDetailSchema.parse(
      (await registrar.get(`imports/${created.id}/rows/7`).expect(200)).body,
    );
    expect(errorRow.issues[0]?.message).toMatch(
      /No program with code or name "NO-SUCH-PROGRAM" exists/,
    );
    expect(JSON.stringify(errorRow)).not.toMatch(/stack|prisma|SQL/i);
    await registrar.get(`imports/${created.id}/rows/99`).expect(404);

    // Error report: an .xlsx with the error/warning rows.
    const report = await registrar
      .get(`imports/${created.id}/error-report`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const workbook = await loadWorkbook(new Uint8Array(report.body as Buffer));
    const issues = workbook.getWorksheet('Issues');
    const reportRows: unknown[][] = [];
    issues?.eachRow((row, number) => {
      if (number > 1) reportRows.push((row.values as unknown[]).slice(1, 6));
    });
    expect(reportRows).toEqual([
      [7, `${prefix}-0006`, 'Test Student Six', 'ERROR', 'UNKNOWN_PROGRAM'],
      [8, `${prefix}-0007`, '', 'ERROR', 'MISSING_STUDENT_NAME'],
      [9, `${prefix}-0008`, 'Test Student Eight', 'WARNING', 'DATE_OF_BIRTH_MISSING'],
    ]);

    // Commit WITHOUT approving updates: creates only; the update and unchanged rows are skipped.
    const committing = jobOf(
      await registrar.post(`imports/${created.id}/commit`, { applyUpdates: false }).expect(200),
    );
    expect(committing.status).toBe('PROCESSING');
    const done = await waitForStatus(registrar, created.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({
      imported: 4,
      skipped: 2,
      errors: 2,
      created: 4,
      updated: 0,
    });
    expect(done.committedBy?.id).toBe(registrar.user.id);
    expect(done.actions).toEqual({
      map: false,
      validate: false,
      commit: false,
      cancel: false,
      retry: false,
    });

    const db = testDb();
    const registrations = await db.studentRegistration.findMany({
      where: { registrationNumberNormalized: { startsWith: prefix } },
      include: { student: true },
      orderBy: { registrationNumberNormalized: 'asc' },
    });
    expect(
      registrations.map((r) => [
        r.registrationNumber,
        r.student.fullName,
        r.departmentId,
        r.status,
      ]),
    ).toEqual([
      [`${prefix}-0001`, 'Test Student One', master.department.id, 'ACTIVE'],
      [`${prefix}-0002`, 'Test Student Two', master.department.id, 'ACTIVE'],
      [`${prefix}-0003`, 'Test Student Three', master.department.id, 'ACTIVE'],
      [`${prefix}-0004`, 'Test Student Four', master.department.id, 'ACTIVE'],
      [`${prefix}-0005`, 'Test Student Five', master.department.id, 'ACTIVE'],
      [`${prefix}-0008`, 'Test Student Eight', master.department.id, 'ACTIVE'],
    ]);
    expect(registrations[1]?.student.dateOfBirth?.toISOString().slice(0, 10)).toBe('2004-02-02');

    // Imported students appear through the normal student API (same records as manual entry).
    const list = await registrar.get(`students?search=${prefix}-0001`).expect(200);
    expect((list.body as { meta: { total: number } }).meta.total).toBe(1);

    // Audit trail: every step, plus per-record entries marked as coming from this import.
    const audit = await db.auditLog.findMany({
      where: {
        OR: [{ entityId: created.id }, { metadata: { path: ['importJobId'], equals: created.id } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    const actions = audit.map((entry) => entry.action);
    for (const action of [
      'STUDENT_IMPORT_CREATED',
      'STUDENT_IMPORT_UPLOADED',
      'STUDENT_IMPORT_MAPPING_SAVED',
      'STUDENT_IMPORT_VALIDATED',
      'STUDENT_IMPORT_COMMIT_REQUESTED',
      'STUDENT_IMPORT_COMMITTED',
    ]) {
      expect(actions, action).toContain(action);
    }
    expect(actions.filter((action) => action === 'STUDENT_CREATED')).toHaveLength(4);
    expect(actions.filter((action) => action === 'REGISTRATION_CREATED')).toHaveLength(4);
    const committed = audit.find((entry) => entry.action === 'STUDENT_IMPORT_COMMITTED');
    expect(committed?.metadata).toMatchObject({
      importJobId: created.id,
      createdRecords: 4,
      updatedRecords: 0,
      errorRows: 2,
    });
    expect(committed?.actorUserId).toBe(registrar.user.id);
    // No spreadsheet content (names) in the audit trail.
    expect(JSON.stringify(audit.map((entry) => entry.metadata))).not.toMatch(/Test Student/);

    // Completed imports cannot be restarted or cancelled.
    expect((await registrar.post(`imports/${created.id}/commit`, {})).status).toBe(409);
    expect((await registrar.post(`imports/${created.id}/validate`)).status).toBe(409);
    expect((await registrar.post(`imports/${created.id}/cancel`)).status).toBe(409);
    expect((await registrar.post(`imports/${created.id}/retry`)).status).toBe(409);
  });

  it('applies approved updates (safe fields only) and never changes identity fields', async () => {
    const master = await masterData();
    const prefix = `UPD-${tag()}`;
    const registrar = await staff(app, ['REGISTRAR']);
    const job = await validated(registrar, await mixedWorkbook(master, prefix));
    await registrar.post(`imports/${job.id}/commit`, { applyUpdates: true }).expect(200);
    const done = await waitForStatus(registrar, job.id, ['COMPLETED']);
    expect(done.counts).toMatchObject({ imported: 5, created: 4, updated: 1, skipped: 1 });
    const updated = await testDb().studentRegistration.findFirstOrThrow({
      where: { registrationNumberNormalized: `${prefix}-0005` },
      include: { student: true },
    });
    expect(updated.student.fullName).toBe('Test Student Five Corrected');
    expect(updated.programId).toBe(master.program.id);
    const audit = await testDb().auditLog.findFirstOrThrow({
      where: { action: 'STUDENT_UPDATED', entityId: updated.studentId },
    });
    expect(audit.metadata).toMatchObject({
      source: 'import',
      importJobId: job.id,
      changedFields: ['fullName'],
    });
  });

  it('rejects a program change for an existing registration as an error row', async () => {
    const master = await masterData();
    const prefix = `IDN-${tag()}`;
    await existingStudent(master, `${prefix}-0001`);
    const registrar = await staff(app, ['REGISTRAR']);
    const job = await validated(
      registrar,
      await buildWorkbook([
        studentSheet([
          {
            registrationNumber: `${prefix}-0001`,
            fullName: 'Test Existing Student',
            programCode: master.otherProgram.code,
            academicSessionCode: master.session.code,
          },
        ]),
      ]),
    );
    expect(job.counts).toMatchObject({ total: 1, errors: 1, create: 0, update: 0 });
    const rows = importRowListSchema.parse(
      (await registrar.get(`imports/${job.id}/rows`).expect(200)).body,
    );
    expect(rows.data[0]?.issues[0]?.code).toBe('PROGRAM_CHANGE_NOT_ALLOWED');
    // Nothing to import → commit refused with a clear message.
    const response = await registrar
      .post(`imports/${job.id}/commit`, { applyUpdates: true })
      .expect(400);
    expect(errorOf(response).details?.[0]?.message).toMatch(/nothing to import/);
  });

  it('validates the mapping (required fields, duplicate columns, unknown worksheet)', async () => {
    const master = await masterData();
    const registrar = await staff(app, ['REGISTRAR']);
    const created = jobOf(
      await upload(
        registrar,
        await buildWorkbook([
          studentSheet([
            {
              registrationNumber: `MAP-${tag()}`,
              fullName: 'Test',
              programCode: master.program.code,
              academicSessionCode: master.session.code,
            },
          ]),
        ]),
      ).expect(201),
    );
    await waitForStatus(registrar, created.id, ['MAPPING']);
    const missing = await registrar.post(`imports/${created.id}/mapping`, {
      worksheet: 'Students',
      columns: { registrationNumber: 1 },
    });
    expect(missing.status).toBe(400);
    expect(errorOf(missing).details?.map((d) => d.path)).toEqual([
      'columns.fullName',
      'columns.programCode',
      'columns.academicSessionCode',
    ]);
    const duplicate = await registrar.post(`imports/${created.id}/mapping`, {
      worksheet: 'Students',
      columns: { registrationNumber: 1, fullName: 1, programCode: 8, academicSessionCode: 10 },
    });
    expect(errorOf(duplicate).details?.[0]?.message).toMatch(/already mapped/);
    const sheet = await registrar.post(`imports/${created.id}/mapping`, {
      worksheet: 'Nope',
      columns: {},
    });
    expect(errorOf(sheet).details?.[0]?.path).toBe('worksheet');
    const unknownField = await registrar.post(`imports/${created.id}/mapping`, {
      worksheet: 'Students',
      columns: { salary: 4 },
    });
    expect(unknownField.status).toBe(400);

    // Mapping is persisted and survives a reload.
    const good = { registrationNumber: 1, fullName: 3, programCode: 8, academicSessionCode: 10 };
    await registrar
      .post(`imports/${created.id}/mapping`, {
        worksheet: 'Students',
        columns: good,
        dateFormat: 'DMY',
      })
      .expect(200);
    const reloaded = jobOf(await registrar.get(`imports/${created.id}`).expect(200));
    expect(reloaded.mapping).toEqual({
      worksheet: 'Students',
      columns: good,
      dateFormat: 'DMY',
      valueMaps: {},
      defaultAcademicSessionId: null,
    });

    // Re-mapping after validation discards the validated rows.
    await registrar.post(`imports/${created.id}/validate`).expect(200);
    await waitForStatus(registrar, created.id, ['VALIDATED']);
    const remapped = jobOf(
      await registrar
        .post(`imports/${created.id}/mapping`, { worksheet: 'Students', columns: good })
        .expect(200),
    );
    expect(remapped.status).toBe('MAPPING');
    expect(remapped.counts.total).toBe(0);
    expect(await testDb().importRow.count({ where: { importJobId: created.id } })).toBe(0);
  });

  it('cancels an import and keeps it cancelled', async () => {
    const master = await masterData();
    const registrar = await staff(app, ['REGISTRAR']);
    const created = jobOf(
      await upload(
        registrar,
        await buildWorkbook([
          studentSheet([
            {
              registrationNumber: `CAN-${tag()}`,
              fullName: 'Test',
              programCode: master.program.code,
              academicSessionCode: master.session.code,
            },
          ]),
        ]),
      ).expect(201),
    );
    await waitForStatus(registrar, created.id, ['MAPPING']);
    const cancelled = jobOf(await registrar.post(`imports/${created.id}/cancel`).expect(200));
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).not.toBeNull();
    for (const step of ['validate', 'commit', 'cancel', 'retry']) {
      expect((await registrar.post(`imports/${created.id}/${step}`, {})).status, step).toBe(409);
    }
    const audit = await testDb().auditLog.findFirst({
      where: { action: 'STUDENT_IMPORT_CANCELLED', entityId: created.id },
    });
    expect(audit?.metadata).toMatchObject({ from: 'MAPPING' });
  });

  it('fails a workbook with no usable data safely, without retrying and without a retry option', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const created = jobOf(
      await upload(
        registrar,
        await buildWorkbook([{ name: 'Empty', rows: [['Registration Number']] }]),
      ).expect(201),
    );
    const failed = await waitForStatus(registrar, created.id, ['FAILED']);
    expect(failed.failure).toEqual({
      stage: 'PARSE',
      code: 'NO_USABLE_WORKSHEET',
      message: 'This worksheet has no data rows below the header row.',
      retryable: false,
    });
    expect(failed.actions.retry).toBe(false);
    expect(
      errorOf(await registrar.post(`imports/${created.id}/retry`).expect(409)).message,
    ).toMatch(/file itself/);
    // A file problem is not a worker retry condition: one attempt only.
    const bullJobs = await worker.queue.getJobs(['completed', 'failed']);
    const parse = bullJobs.find(
      (job) => (job.data as { importJobId?: string }).importJobId === created.id,
    );
    expect(parse?.attemptsMade).toBe(1);
    expect(parse?.returnvalue).toBe('failed');
  });

  it('lists import history with filters and returns creators', async () => {
    const master = await masterData();
    const registrar = await staff(app, ['REGISTRAR']);
    const created = jobOf(
      await upload(
        registrar,
        await buildWorkbook([
          studentSheet([
            {
              registrationNumber: `HIS-${tag()}`,
              fullName: 'Test',
              programCode: master.program.code,
              academicSessionCode: master.session.code,
            },
          ]),
        ]),
        'history-check.xlsx',
      ).expect(201),
    );
    await waitForStatus(registrar, created.id, ['MAPPING']);
    const mine = await registrar.get(`imports?createdById=${registrar.user.id}`).expect(200);
    expect(
      (mine.body as { data: { id: string; createdBy: { id: string } }[] }).data.map(
        (row) => row.id,
      ),
    ).toEqual([created.id]);
    const byStatus = await registrar.get(`imports?status=MAPPING&search=history-check`).expect(200);
    expect((byStatus.body as { meta: { total: number } }).meta.total).toBeGreaterThanOrEqual(1);
    const today = new Date().toISOString().slice(0, 10);
    const byDate = await registrar
      .get(`imports?from=${today}&to=${today}&createdById=${registrar.user.id}`)
      .expect(200);
    expect((byDate.body as { meta: { total: number } }).meta.total).toBe(1);
    expect(
      (await registrar.get('imports?from=2000-01-01&to=2000-01-02').expect(200)).body,
    ).toMatchObject({ meta: { total: 0 } });
    expect((await registrar.get('imports?status=NOPE')).status).toBe(400);
    const creators = await registrar.get('imports/creators').expect(200);
    expect(
      (creators.body as { data: { id: string }[] }).data.some(
        (user) => user.id === registrar.user.id,
      ),
    ).toBe(true);
    await registrar.get('imports/0199a8f0-0000-7000-8000-00000000abcd').expect(404);
    await registrar.get('imports/not-a-uuid').expect(404);
  });
});
