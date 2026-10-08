import type { INestApplication } from '@nestjs/common';
import { buildWorkbook, generatedStudents, studentSheet } from '@docversity/imports/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  browser,
  createTestApp,
  errorOf,
  http,
  realConfig,
  signIn,
  staff,
  createTestUser,
  testDb,
} from '../helpers.js';
import {
  binaryParser,
  jobOf,
  masterData,
  startImportWorker,
  upload,
  waitForStatus,
  XLSX,
  type ImportWorker,
} from './support.js';

let app: INestApplication;
let worker: ImportWorker;
const config = realConfig({ IMPORT_MAX_FILE_MB: 1 });

beforeAll(async () => {
  app = await createTestApp(config);
  worker = await startImportWorker(config);
});
afterAll(async () => {
  await worker.close();
  await app.close();
});

async function validWorkbook() {
  const master = await masterData();
  return buildWorkbook([
    studentSheet(
      generatedStudents(2, {
        prefix: `SEC-${master.session.code}`,
        programCode: master.program.code,
        academicSessionCode: master.session.code,
      }),
    ),
  ]);
}

describe('student import security', () => {
  it('requires a session for every import endpoint', async () => {
    expect((await http(app).get('/api/v1/imports')).status).toBe(401);
    expect((await http(app).get('/api/v1/imports/templates/students')).status).toBe(401);
    const response = await http(app)
      .post('/api/v1/imports')
      .attach('file', Buffer.from('x'), 'a.xlsx');
    expect(response.status).toBe(401);
  });

  it('rejects users without the permission (VIEWER, EXAM_ADMIN) — enforced by the API, not the UI', async () => {
    const bytes = await validWorkbook();
    for (const role of ['VIEWER', 'EXAM_ADMIN'] as const) {
      const member = await staff(app, [role]);
      const response = await upload(member, bytes);
      expect(response.status, role).toBe(403);
      expect(errorOf(response).code).toBe('FORBIDDEN');
      expect((await member.get('imports')).status, role).toBe(403);
      expect((await member.get('imports/templates/students')).status, role).toBe(403);
    }
  });

  it('enforces CSRF on upload and on every step (the file is not read before the check)', async () => {
    const user = await createTestUser({ roles: ['REGISTRAR'] });
    const agent = browser(app);
    await signIn(agent, user);
    const response = await agent
      .post('/api/v1/imports')
      .field('type', 'STUDENTS')
      .attach('file', Buffer.from(await validWorkbook()), {
        filename: 'students.xlsx',
        contentType: XLSX,
      });
    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe('CSRF_INVALID');
    const someId = '0199a8f0-0000-7000-8000-000000000001';
    for (const step of ['validate', 'commit', 'cancel', 'retry', 'mapping']) {
      expect((await agent.post(`/api/v1/imports/${someId}/${step}`).send({})).status, step).toBe(
        403,
      );
    }
  });

  it('rejects oversized files with a clear message', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const response = await upload(registrar, new Uint8Array(1.5 * 1024 * 1024));
    expect(response.status).toBe(413);
    expect(errorOf(response)).toMatchObject({
      code: 'FILE_TOO_LARGE',
      message: expect.stringMatching(/larger than 1 MB/) as unknown,
    });
  });

  it('rejects wrong file types — extension, MIME type and actual content are all checked', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const bytes = await validWorkbook();
    const csv = await upload(
      registrar,
      new TextEncoder().encode('reg,name\n1,Test'),
      'students.csv',
      'text/csv',
    );
    expect(csv.status).toBe(400);
    expect(errorOf(csv).code).toBe('UNSUPPORTED_FILE');
    const pdfType = await upload(registrar, bytes, 'students.xlsx', 'application/pdf');
    expect(errorOf(pdfType).code).toBe('UNSUPPORTED_FILE');
    const renamed = await upload(
      registrar,
      new TextEncoder().encode('reg,name\n1,Test'),
      'students.xlsx',
    );
    expect(renamed.status).toBe(400);
    expect(errorOf(renamed).message).toMatch(/not a valid \.xlsx workbook/);
    const legacy = new Uint8Array(1024);
    legacy.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(errorOf(await upload(registrar, legacy, 'old.xlsx')).message).toMatch(
      /old \.xls format/,
    );
    const empty = await upload(registrar, new Uint8Array(0), 'empty.xlsx');
    expect(empty.status).toBe(400);
  });

  it('treats a malicious filename as display text only; storage keys are generated and never exposed', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    // A NUL byte in the multipart header is refused outright (nothing is stored).
    expect((await upload(registrar, await validWorkbook(), 'evil\u0000.xlsx')).status).toBe(400);
    const response = await upload(registrar, await validWorkbook(), '../../../etc/passwd.xlsx');
    expect(response.status).toBe(201);
    const job = jobOf(response);
    expect(job.originalFilename).toBe('passwd.xlsx');
    expect(JSON.stringify(response.body)).not.toMatch(/imports\/|storage|source-/i);
    const stored = await testDb().importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.storageKey).toMatch(
      new RegExp(`^imports/${job.id}/source-[0-9a-f-]{36}\\.xlsx$`),
    );
    expect(stored.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    await waitForStatus(registrar, job.id, ['MAPPING']);
  });

  it('keeps stored workbooks private (no anonymous access to the bucket)', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const job = jobOf(await upload(registrar, await validWorkbook()).expect(201));
    const { storageKey } = await testDb().importJob.findUniqueOrThrow({ where: { id: job.id } });
    const anonymous = await fetch(
      `${config.S3_ENDPOINT ?? ''}/${config.S3_BUCKET}/${storageKey ?? ''}`,
    );
    expect(anonymous.status).toBe(403);
    await waitForStatus(registrar, job.id, ['MAPPING']);
  });

  it('serves the template as a private download', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const response = await registrar
      .get('imports/templates/students')
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(response.headers['content-type']).toBe(XLSX);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="docversity-student-import-template.xlsx"',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('only accepts the STUDENTS import type in Phase 5', async () => {
    const registrar = await staff(app, ['REGISTRAR']);
    const response = await registrar.agent
      .post('/api/v1/imports')
      .set('X-CSRF-Token', registrar.csrf)
      .field('type', 'RESULTS')
      .attach('file', Buffer.from(await validWorkbook()), {
        filename: 'r.xlsx',
        contentType: XLSX,
      });
    expect(response.status).toBe(400);
    expect(errorOf(response).details?.[0]?.path).toBe('type');
  });
});
