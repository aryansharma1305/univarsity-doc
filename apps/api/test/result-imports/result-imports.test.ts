import type { INestApplication } from '@nestjs/common';
import { loadWorkbook } from '@docversity/imports';
import { buildWorkbook } from '@docversity/imports/testing';
import { Redis } from 'ioredis';
import { ResultPreviewStore } from '../../src/result-imports/result-preview.store.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  resultImportContextOptionsSchema,
  resultPreviewRowListSchema,
} from '@docversity/validation';
import type { ApiConfig } from '../../src/config/api-config.js';
import {
  browser,
  createTestApp,
  errorOf,
  realConfig,
  staff,
  type Staff,
  testDb,
} from '../helpers.js';
import { binaryParser } from '../imports/support.js';
import {
  contextFor,
  previewOf,
  RESULT_HEADERS,
  resultsFixture,
  type ResultsFixture,
  TEMPLATE_MAPPING,
  uploadPreview,
  workbook,
} from './support.js';

let config: ApiConfig;
let app: INestApplication;
let registrar: Staff;
let examAdmin: Staff;
let otherExamAdmin: Staff;
let viewer: Staff;
let redis: Redis;
let fixture: ResultsFixture;

beforeAll(async () => {
  config = realConfig({ IMPORT_MAX_FILE_MB: 1 });
  app = await createTestApp(config);
  [registrar, examAdmin, otherExamAdmin, viewer] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['EXAM_ADMIN']),
    staff(app, ['VIEWER']),
  ]);
  redis = new Redis(config.REDIS_URL);
  fixture = await resultsFixture(registrar, examAdmin);
});
afterAll(async () => {
  await redis.quit();
  await app.close();
});

/** Rows written to the official results tables (must never change in this phase). */
async function officialCounts() {
  const programId = fixture.program.id;
  const db = testDb();
  return {
    results: await db.result.count({ where: { studentRegistration: { programId } } }),
    items: await db.resultItem.count({ where: { result: { studentRegistration: { programId } } } }),
    registrations: await db.studentRegistration.findMany({
      where: { programId },
      orderBy: { id: 'asc' },
    }),
    payments: await db.reExamPayment.count({
      where: { application: { registration: { programId } } },
    }),
  };
}

async function rowsOf(user: Staff, id: string, query = '') {
  return resultPreviewRowListSchema.parse(
    (await user.get(`result-imports/previews/${id}/rows?pageSize=100${query}`).expect(200)).body,
  );
}

function download(user: Staff, path: string) {
  return user.agent.get(`/api/v1/${path}`).buffer(true).parse(binaryParser);
}

function readXlsx(body: Buffer) {
  return loadWorkbook(new Uint8Array(body));
}

describe('access control', () => {
  it('requires imports.results.run for every route (REGISTRAR, VIEWER and anonymous refused)', async () => {
    for (const user of [registrar, viewer]) {
      expect((await user.get('result-imports/context')).status).toBe(403);
      expect((await user.get('result-imports/template')).status).toBe(403);
      const exam = await fixture.examination();
      const refused = await uploadPreview(user, contextFor(fixture, exam), await workbook([]));
      expect(refused.status).toBe(403);
    }
    const anonymous = browser(app);
    expect((await anonymous.get('/api/v1/result-imports/context')).status).toBe(401);
  });

  it('requires a CSRF token for uploads and validation', async () => {
    const exam = await fixture.examination();
    const response = await examAdmin.agent
      .post('/api/v1/result-imports/previews')
      .field('examinationId', exam.id)
      .attach('file', Buffer.from(await workbook([])), 'results.xlsx');
    expect(response.status).toBe(403);
  });
});

describe('template and academic context', () => {
  it('downloads a text-formatted results template without grade or context columns', async () => {
    const response = await download(examAdmin, 'result-imports/template').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const book = await readXlsx(response.body as Buffer);
    const sheet = book.getWorksheet('Results');
    expect((sheet?.getRow(1).values as unknown[]).slice(1)).toEqual(RESULT_HEADERS);
    expect(sheet?.getColumn(1).numFmt).toBe('@');
  });

  it('lists examinations by course and curriculum, with blockers instead of fabricated context', async () => {
    const open = await fixture.examination();
    const draft = await fixture.examination({ open: false });
    const options = resultImportContextOptionsSchema.parse(
      (await examAdmin.get('result-imports/context').expect(200)).body,
    );
    const course = options.programs.find((program) => program.id === fixture.program.id);
    const version = course?.curricula.find((c) => c.id === fixture.curriculum.id);
    expect(version?.periods).toEqual([
      { number: 1, label: 'Semester 1', subjectCount: 2 },
      { number: 2, label: 'Semester 2', subjectCount: 1 },
    ]);
    expect(version?.examinations.find((e) => e.id === open.id)?.blocker).toBeNull();
    expect(version?.examinations.find((e) => e.id === draft.id)?.blocker).toBe('EXAMINATION_DRAFT');
  });

  it('refuses a context that does not belong together (client identifiers are re-checked)', async () => {
    const exam = await fixture.examination({ period: 1 });
    const bytes = await workbook([]);
    const wrongPeriod = await uploadPreview(
      examAdmin,
      { ...contextFor(fixture, exam), periodNumber: '2' },
      bytes,
    );
    expect(wrongPeriod.status).toBe(400);
    expect(errorOf(wrongPeriod).details).toEqual([
      { path: 'periodNumber', message: 'The examination belongs to another semester/year.' },
    ]);
    const other = await resultsFixture(registrar, examAdmin, { subjects: [{ period: 1 }] });
    const wrongCourse = await uploadPreview(
      examAdmin,
      {
        ...contextFor(fixture, exam),
        programId: other.program.id,
        curriculumId: other.curriculum.id,
      },
      bytes,
    );
    expect(wrongCourse.status).toBe(400);
    expect(errorOf(wrongCourse).details?.map((detail) => detail.path)).toEqual([
      'programId',
      'curriculumId',
    ]);
    const unknown = await uploadPreview(
      examAdmin,
      { ...contextFor(fixture, exam), examinationId: '0190f5f0-0000-7000-8000-000000000000' },
      bytes,
    );
    expect(unknown.status).toBe(400);
    const malformed = await uploadPreview(
      examAdmin,
      { ...contextFor(fixture, exam), examinationId: 'x' },
      bytes,
    );
    expect(malformed.status).toBe(400);
  });

  it('refuses draft and archived examinations', async () => {
    const draft = await fixture.examination({ open: false });
    const refused = await uploadPreview(examAdmin, contextFor(fixture, draft), await workbook([]));
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toMatch(/still a draft/);
    const archived = await fixture.examination();
    await examAdmin.post(`examinations/${archived.id}/archive`).expect(200);
    expect(
      (await uploadPreview(examAdmin, contextFor(fixture, archived), await workbook([]))).status,
    ).toBe(409);
  });
});

describe('semester-wise preview', () => {
  it('maps, validates and classifies rows without writing any official record', async () => {
    const [subjectA, subjectB, subjectSem2] = fixture.subjects;
    const good = await fixture.student();
    const second = await fixture.student();
    const third = await fixture.student();
    const negative = await fixture.student();
    const precision = await fixture.student();
    const empty = await fixture.student();
    const unassigned = await fixture.student({ curriculumId: null });
    const outsider = await resultsFixture(registrar, examAdmin, { subjects: [{ period: 1 }] });
    const foreign = await outsider.student();
    const exam = await fixture.examination({ period: 1 });
    const before = await officialCounts();

    const bytes = await workbook([
      [good.registrationNumber, subjectA?.code ?? '', 25, 60, null, null, 85], // 2 valid
      [good.registrationNumber, subjectB?.code ?? '', null, null, null, null, 0], // 3 valid (zero)
      [good.registrationNumber, subjectA?.code ?? '', 20, 50, null, null, 70], // 4 duplicate
      [second.registrationNumber, subjectA?.code ?? '', 31, 60, null, null, 91], // 5 over max
      [third.registrationNumber, subjectA?.code ?? '', null, 60, null, null, 60], // 6 internal missing
      [second.registrationNumber, subjectSem2?.code ?? '', null, null, null, null, 40], // 7 wrong period
      [second.registrationNumber, 'NOPE-404', null, null, null, null, 40], // 8 unknown subject
      [foreign.registrationNumber, subjectB?.code ?? '', null, null, null, null, 40], // 9 other course
      [unassigned.registrationNumber, subjectB?.code ?? '', null, null, null, null, 40], // 10 no curriculum
      [Number(second.registrationNumber), subjectB?.code ?? '', null, null, null, null, 40], // 11 numeric
      [
        { formula: 'A2', result: good.registrationNumber },
        subjectB?.code ?? '',
        null,
        null,
        null,
        null,
        40,
      ], // 12
      [
        second.registrationNumber,
        subjectB?.code ?? '',
        null,
        null,
        null,
        null,
        { formula: 'C2*2', result: 40 },
      ], // 13
      [negative.registrationNumber, subjectB?.code ?? '', null, null, null, null, -1], // 14 negative
      [precision.registrationNumber, subjectB?.code ?? '', null, null, null, null, 12.345], // 15 precision
      [empty.registrationNumber, subjectB?.code ?? '', null, null, null, null, null], // 16 no marks
      ['=HYPERLINK("http://x")', subjectB?.code ?? '', null, null, null, null, 40], // 17 injection text
    ]);
    const created = await uploadPreview(examAdmin, contextFor(fixture, exam), bytes);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const preview = previewOf(created);
    expect(preview).toMatchObject({
      status: 'MAPPING',
      previewOnly: true,
      counts: null,
      mapping: null,
      context: {
        program: { id: fixture.program.id },
        curriculum: { id: fixture.curriculum.id, structureType: 'SEMESTER_WISE' },
        period: { number: 1, label: 'Semester 1' },
        examination: { id: exam.id },
        subjectCount: 2,
      },
      unrecognizedComponents: [],
    });
    expect(preview.components).toEqual([
      { field: 'internalMarks', configured: true, required: true },
      { field: 'externalMarks', configured: true, required: true },
      { field: 'practicalMarks', configured: false, required: false },
      { field: 'otherMarks', configured: false, required: false },
    ]);
    expect(preview.sheets[0]?.suggestedMapping).toMatchObject(TEMPLATE_MAPPING.columns);
    // No cell values leave the server before validation.
    expect(JSON.stringify(preview)).not.toContain(good.registrationNumber);
    const expiresIn = Date.parse(preview.expiresAt) - Date.parse(preview.createdAt);
    expect(expiresIn).toBe(2 * 60 * 60 * 1000);

    // Mapping: required component columns are enforced.
    const missingInternal = await examAdmin.post(`result-imports/previews/${preview.id}/validate`, {
      worksheet: 'Results',
      columns: { ...TEMPLATE_MAPPING.columns, internalMarks: null },
    });
    expect(missingInternal.status).toBe(400);
    expect(errorOf(missingInternal).details?.[0]?.path).toBe('columns.internalMarks');

    const validated = previewOf(
      await examAdmin
        .post(`result-imports/previews/${preview.id}/validate`, TEMPLATE_MAPPING)
        .expect(200),
    );
    expect(validated.status).toBe('VALIDATED');
    expect(validated.counts).toEqual({ total: 16, valid: 2, warnings: 0, errors: 14 });
    expect(validated.hasErrorReport).toBe(true);

    const rows = (await rowsOf(examAdmin, preview.id)).data;
    const codesAt = (rowNumber: number) =>
      rows.find((row) => row.rowNumber === rowNumber)?.issues.map((issue) => issue.code);
    expect(rows.find((row) => row.rowNumber === 2)).toMatchObject({
      status: 'VALID',
      registrationNumber: good.registrationNumber,
      subjectCode: subjectA?.code,
      marks: { internalMarks: '25', externalMarks: '60', totalMarks: '85' },
    });
    expect(rows.find((row) => row.rowNumber === 2)?.subjectName).toMatch(
      /Synthetic Results Subject/,
    );
    expect(rows.find((row) => row.rowNumber === 3)).toMatchObject({
      status: 'VALID',
      marks: { totalMarks: '0' },
    });
    expect(codesAt(4)).toEqual(['DUPLICATE_ROW']);
    expect(codesAt(5)).toEqual(['EXCEEDS_MAX_MARKS']);
    expect(codesAt(6)).toEqual(['REQUIRED_COMPONENT_MISSING']);
    expect(codesAt(7)).toEqual(['SUBJECT_PERIOD_MISMATCH']);
    expect(codesAt(8)).toEqual(['SUBJECT_NOT_FOUND']);
    expect(codesAt(9)).toEqual(['REGISTRATION_NOT_FOUND']);
    expect(codesAt(10)).toEqual(['CURRICULUM_NOT_ASSIGNED']);
    expect(codesAt(11)).toEqual(['NUMERIC_REGISTRATION']);
    expect(codesAt(12)).toEqual(['FORMULA_REGISTRATION']);
    expect(codesAt(13)).toEqual(expect.arrayContaining(['FORMULA_NOT_ALLOWED']));
    expect(codesAt(14)).toEqual(['NEGATIVE_MARKS_NOT_ALLOWED']);
    expect(codesAt(15)).toEqual(['INVALID_NUMBER']);
    expect(codesAt(16)).toEqual(['NO_MARKS']);
    expect(codesAt(17)).toEqual(['REGISTRATION_NOT_FOUND']);
    // Another course's registration is never confirmed to exist.
    const foreignMessage = rows.find((row) => row.rowNumber === 9)?.issues[0]?.message;
    expect(foreignMessage).toBe(
      `Registration number '${foreign.registrationNumber}' is not registered in the selected course.`,
    );

    // Filters and search.
    expect((await rowsOf(examAdmin, preview.id, '&filter=valid')).meta.total).toBe(2);
    expect((await rowsOf(examAdmin, preview.id, '&filter=errors')).meta.total).toBe(14);
    expect(
      (await rowsOf(examAdmin, preview.id, '&code=DUPLICATE_ROW')).data.map((r) => r.rowNumber),
    ).toEqual([4]);
    expect(
      (await rowsOf(examAdmin, preview.id, `&search=${good.registrationNumber}`)).meta.total,
    ).toBe(4); // Includes the rejected formula row's displayed cached text.
    expect(
      (await examAdmin.get(`result-imports/previews/${preview.id}/rows?unknown=1`)).status,
    ).toBe(400);

    // Error report: issues only, original row numbers, formula-escaped, no names from Docversity.
    const report = await download(
      examAdmin,
      `result-imports/previews/${preview.id}/error-report`,
    ).expect(200);
    expect(report.headers['cache-control']).toBe('no-store');
    const book = await readXlsx(report.body as Buffer);
    const issues = book.getWorksheet('Issues');
    expect(issues?.rowCount).toBe(15);
    expect(issues?.getCell('A2').value).toBe(4);
    const injected: unknown[] = [];
    issues?.eachRow((row) => {
      if (row.getCell(1).value === 17) injected.push(row.getCell(2).value);
    });
    expect(injected).toEqual(['\'=HYPERLINK("HTTP://X")']);
    const summary = book.getWorksheet('Summary');
    expect(summary?.getCell('B2').value).toMatch(/Preview only/);
    let text = '';
    book.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        text += JSON.stringify(row.values);
      });
    });
    expect(text).not.toContain('Synthetic Results Student');

    // Nothing official was written.
    expect(await officialCounts()).toEqual(before);
    const audit = await testDb().auditLog.findMany({
      where: { entityId: preview.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      'RESULT_IMPORT_PREVIEW_CREATED',
      'RESULT_IMPORT_PREVIEW_VALIDATED',
      'RESULT_IMPORT_PREVIEW_REPORT_DOWNLOADED',
    ]);
    expect(JSON.stringify(audit.map((entry) => entry.metadata))).not.toContain(
      good.registrationNumber,
    );
  });

  it('accepts a correctly mapped university layout with manual overrides', async () => {
    const student = await fixture.student();
    const [subjectA] = fixture.subjects;
    const exam = await fixture.examination();
    const bytes = await workbook(
      [[subjectA?.code ?? '', 'x', student.registrationNumber, 70, 20, 90]],
      ['Paper', 'Remarks', 'Enrolment', 'Theory', 'Internal', 'Total'],
      'Marks',
    );
    const preview = previewOf(
      await uploadPreview(examAdmin, contextFor(fixture, exam), bytes).expect(201),
    );
    // Automatic suggestions find only what the headers say; the rest is mapped by hand.
    expect(preview.sheets[0]?.suggestedMapping).toMatchObject({
      registrationNumber: null,
      subjectCode: null,
      externalMarks: 4,
      internalMarks: 5,
      totalMarks: 6,
    });
    const duplicate = await examAdmin.post(`result-imports/previews/${preview.id}/validate`, {
      worksheet: 'Marks',
      columns: { registrationNumber: 3, subjectCode: 3, externalMarks: 4, internalMarks: 5 },
    });
    expect(duplicate.status).toBe(400);
    expect(errorOf(duplicate).details?.[0]?.message).toMatch(/already mapped/);
    const validated = previewOf(
      await examAdmin
        .post(`result-imports/previews/${preview.id}/validate`, {
          worksheet: 'Marks',
          columns: {
            registrationNumber: 3,
            subjectCode: 1,
            externalMarks: 4,
            internalMarks: 5,
            totalMarks: 6,
          },
        })
        .expect(200),
    );
    expect(validated.counts).toEqual({ total: 1, valid: 1, warnings: 0, errors: 0 });
    expect((await examAdmin.get(`result-imports/previews/${preview.id}/error-report`)).status).toBe(
      404,
    );
  });
});

describe('year-wise courses and curriculum versions', () => {
  it('previews a year-wise course and rejects students of another curriculum version', async () => {
    const yearly = await resultsFixture(registrar, examAdmin, {
      structure: 'YEAR_WISE',
      periods: 2,
      versions: 2,
      subjects: [
        { period: 1, maxMarks: 100 },
        { period: 2, maxMarks: 100 },
      ],
    });
    const [v2020, v2021] = yearly.curricula;
    const onExamVersion = await yearly.student({ curriculumId: v2021?.id });
    const onOldVersion = await yearly.student({ curriculumId: v2020?.id });
    const exam = await yearly.examination({ curriculumId: v2021?.id, period: 1 });
    const code = yearly.subjects[0]?.code ?? '';
    const bytes = await workbook([
      [onExamVersion.registrationNumber, code, null, null, null, null, 75],
      [onOldVersion.registrationNumber, code, null, null, null, null, 75],
    ]);
    const preview = previewOf(
      await uploadPreview(examAdmin, contextFor(yearly, exam, v2021?.id), bytes).expect(201),
    );
    expect(preview.context.period).toEqual({ number: 1, label: 'Year 1' });
    expect(preview.context.curriculum.structureType).toBe('YEAR_WISE');
    previewOf(
      await examAdmin
        .post(`result-imports/previews/${preview.id}/validate`, TEMPLATE_MAPPING)
        .expect(200),
    );
    const rows = (await rowsOf(examAdmin, preview.id)).data;
    expect(rows.map((row) => [row.status, row.issues.map((issue) => issue.code)])).toEqual([
      ['VALID', []],
      ['ERROR', ['CURRICULUM_MISMATCH']],
    ]);
  });

  it('warns about inactive registrations, existing results and ignored grades', async () => {
    const exam = await fixture.examination();
    const suspended = await fixture.student();
    await testDb().studentRegistration.update({
      where: { id: suspended.registrationId },
      data: { status: 'SUSPENDED' },
    });
    const graded = await fixture.student();
    const code = fixture.subjects[1]?.code ?? '';
    const bytes = await workbook(
      [
        [suspended.registrationNumber, code, null, null, 40, null],
        [graded.registrationNumber, code, null, null, 40, 'A'],
      ],
      [
        'Registration Number',
        'Subject Code',
        'Internal Marks',
        'External Marks',
        'Total Marks',
        'Grade',
      ],
    );
    const preview = previewOf(
      await uploadPreview(examAdmin, contextFor(fixture, exam), bytes).expect(201),
    );
    const validated = previewOf(
      await examAdmin
        .post(`result-imports/previews/${preview.id}/validate`, {
          worksheet: 'Results',
          // Semester 1 has a subject requiring internal/external marks, so those columns are mapped.
          columns: {
            registrationNumber: 1,
            subjectCode: 2,
            internalMarks: 3,
            externalMarks: 4,
            totalMarks: 5,
            grade: 6,
          },
        })
        .expect(200),
    );
    expect(validated.counts).toEqual({ total: 2, valid: 0, warnings: 2, errors: 0 });
    const rows = (await rowsOf(examAdmin, preview.id)).data;
    expect(rows.map((row) => row.issues.map((issue) => issue.code))).toEqual([
      ['REGISTRATION_NOT_ACTIVE'],
      ['GRADE_NOT_ACCEPTED'],
    ]);
  });
});

describe('files', () => {
  it('bounds retained rows across worksheets, even when each sheet fits individually', async () => {
    const limited = await createTestApp({ ...config, IMPORT_MAX_ROWS: 2 });
    try {
      const user = await staff(limited, ['EXAM_ADMIN']);
      const exam = await fixture.examination();
      const bytes = await buildWorkbook(
        ['First', 'Second'].map((name) => ({
          name,
          rows: [
            RESULT_HEADERS,
            ['0001', 'X', null, null, null, null, 1],
            ['0002', 'X', null, null, null, null, 2],
          ],
        })),
      );
      const refused = await uploadPreview(user, contextFor(fixture, exam), bytes);
      expect(refused.status).toBe(400);
      expect(errorOf(refused).message).toMatch(/limit across its worksheets/);
      expect(
        await redis.zcard(`${config.REDIS_KEY_PREFIX}result-previews-user:${user.user.id}`),
      ).toBe(0);
    } finally {
      await limited.close();
    }
  });

  it('rejects corrupt, renamed and oversized files with safe messages', async () => {
    const exam = await fixture.examination();
    const context = contextFor(fixture, exam);
    const corrupt = await uploadPreview(examAdmin, context, new TextEncoder().encode('not a zip'));
    expect(corrupt.status).toBe(400);
    expect(errorOf(corrupt).code).toBe('UNSUPPORTED_FILE');
    const wrongExtension = await uploadPreview(
      examAdmin,
      context,
      await workbook([]),
      'results.csv',
    );
    expect(errorOf(wrongExtension).code).toBe('UNSUPPORTED_FILE');
    const big = new Uint8Array(1.5 * 1024 * 1024);
    const tooLarge = await uploadPreview(examAdmin, context, big);
    expect(tooLarge.status).toBe(413);
    const empty = await uploadPreview(examAdmin, context, await workbook([]));
    expect(empty.status).toBe(400);
    expect(errorOf(empty).message).toMatch(/no data rows/);
  });
});

describe('isolation, expiry and cleanup', () => {
  it('keeps previews private to their uploader', async () => {
    const exam = await fixture.examination();
    const student = await fixture.student();
    const bytes = await workbook([
      [student.registrationNumber, fixture.subjects[1]?.code ?? '', null, null, null, null, 10],
    ]);
    const preview = previewOf(
      await uploadPreview(examAdmin, contextFor(fixture, exam), bytes).expect(201),
    );
    await examAdmin
      .post(`result-imports/previews/${preview.id}/validate`, TEMPLATE_MAPPING)
      .expect(200);
    const base = `result-imports/previews/${preview.id}`;
    expect((await otherExamAdmin.get(base)).status).toBe(404);
    expect((await otherExamAdmin.get(`${base}/rows`)).status).toBe(404);
    expect((await otherExamAdmin.get(`${base}/error-report`)).status).toBe(404);
    expect((await otherExamAdmin.post(`${base}/validate`, TEMPLATE_MAPPING)).status).toBe(404);
    expect((await otherExamAdmin.del(base)).status).toBe(404);
    expect((await examAdmin.get(base)).status).toBe(200);
  });

  it('stores previews only with a fixed expiry, deletes them on discard and when they expire', async () => {
    const user = await staff(app, ['EXAM_ADMIN']);
    const exam = await fixture.examination();
    const bytes = await workbook([
      ['0001', fixture.subjects[1]?.code ?? '', null, null, null, null, 10],
    ]);
    const kept = previewOf(await uploadPreview(user, contextFor(fixture, exam), bytes).expect(201));
    const keys = await redis.keys(`${config.REDIS_KEY_PREFIX}result-preview:${kept.id}:*`);
    expect(keys.sort()).toEqual([
      `${config.REDIS_KEY_PREFIX}result-preview:${kept.id}:meta`,
      `${config.REDIS_KEY_PREFIX}result-preview:${kept.id}:source`,
    ]);
    for (const key of keys) {
      const ttl = await redis.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
    }
    // Simulated expiry: Redis removes the keys; the preview is gone.
    for (const key of keys) await redis.pexpire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await user.get(`result-imports/previews/${kept.id}`)).status).toBe(404);

    const discarded = previewOf(
      await uploadPreview(user, contextFor(fixture, exam), bytes).expect(201),
    );
    const store = app.get(ResultPreviewStore);
    const staleMeta = await store.meta(discarded.id, user.user.id);
    await user.del(`result-imports/previews/${discarded.id}`).expect(204);
    if (!staleMeta) throw new Error('missing preview');
    await expect(store.saveValidation(staleMeta, [])).rejects.toMatchObject({ status: 404 });
    expect(await redis.keys(`${config.REDIS_KEY_PREFIX}result-preview:${discarded.id}:*`)).toEqual(
      [],
    );
    expect((await user.get(`result-imports/previews/${discarded.id}`)).status).toBe(404);
  });

  it('limits open previews per staff member', async () => {
    const user = await staff(app, ['EXAM_ADMIN']);
    const exam = await fixture.examination();
    const bytes = await workbook([['0001', 'X', null, null, null, null, 1]]);
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () => uploadPreview(user, contextFor(fixture, exam), bytes)),
    );
    expect(concurrent.filter((response) => response.status === 201)).toHaveLength(5);
    expect(concurrent.filter((response) => response.status === 409)).toHaveLength(3);
    const refused = await uploadPreview(user, contextFor(fixture, exam), bytes);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toMatch(/5 open previews/);
  });
});
