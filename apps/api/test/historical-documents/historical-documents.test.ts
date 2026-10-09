import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from '@docversity/storage';
import {
  historicalDocumentDetailSchema,
  historicalDocumentListSchema,
  studentDocumentListSchema,
} from '@docversity/validation';
import {
  browser,
  createTestApp,
  errorOf,
  realConfig,
  staff,
  testDb,
  type Staff,
} from '../helpers.js';
import { activatedStudent } from '../student-auth/support.js';
import { binaryParser } from '../imports/support.js';
import { pdfWithCompressedScript, scans, staticPdf } from './support.js';

type Agent = ReturnType<typeof browser>;

let app: INestApplication;
let registrar: Staff;
let certAdmin: Staff;
let approver: Staff;
let viewer: Staff;
let examAdmin: Staff;
const storage = new MemoryObjectStorage();

beforeAll(async () => {
  app = await createTestApp(realConfig(), { objectStorage: storage });
  [registrar, certAdmin, approver, viewer, examAdmin] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['CERTIFICATE_ADMIN']),
    staff(app, ['APPROVER']),
    staff(app, ['VIEWER']),
    staff(app, ['EXAM_ADMIN']),
  ]);
});
afterAll(async () => {
  await app.close();
});

const detailOf = (body: unknown) => historicalDocumentDetailSchema.parse(body);

interface FilePart {
  bytes: Buffer;
  contentType: string;
  filename?: string;
}

/** Multipart upload (or replacement) as a staff member. */
function upload(
  member: Staff,
  fields: Record<string, string>,
  file: FilePart | null,
  path = 'historical-documents',
) {
  let req = member.agent.post(`/api/v1/${path}`).set('X-CSRF-Token', member.csrf);
  for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
  if (file) {
    req = req.attach('file', file.bytes, {
      filename: file.filename ?? 'scan.pdf',
      contentType: file.contentType,
    });
  }
  return req;
}

const pdf = (marker = String(Math.random())): FilePart => ({
  bytes: staticPdf('', marker),
  contentType: 'application/pdf',
});

function metadata(registrationId: string, extra: Record<string, string> = {}) {
  return {
    studentRegistrationId: registrationId,
    documentType: 'DEGREE_CERTIFICATE',
    title: 'Bachelor degree certificate (synthetic)',
    provenance: 'LEGACY_WORDPRESS',
    certificateNumber: 'LEG/2019/00042',
    issuedOn: '2019-07-15',
    legacySourceSystem: 'WORDPRESS',
    legacyRecordId: 'wp-post-12345',
    legacyVerificationUrl: 'https://verify.example.test/certificate?id=ABC123',
    ...extra,
  };
}

async function draftFor(registrationId: string, member: Staff = registrar, file = pdf()) {
  const response = await upload(member, metadata(registrationId), file);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return detailOf(response.body);
}

async function studentDocs(agent: Agent) {
  return studentDocumentListSchema.parse(
    (await agent.get('/api/v1/student/documents').expect(200)).body,
  ).data;
}

describe('upload and validation', () => {
  it('stores a draft privately with provenance and legacy identifiers preserved exactly', async () => {
    const s = await activatedStudent(app, registrar, 'HDOC');
    const original = pdf('PROVENANCE');
    const doc = await draftFor(s.registrationId, registrar, {
      ...original,
      filename: '../../etc/passwd.pdf',
    });
    expect(doc).toMatchObject({
      status: 'DRAFT',
      authenticity: 'UNVERIFIED',
      certificateNumber: 'LEG/2019/00042',
      issuedOn: '2019-07-15',
      provenance: 'LEGACY_WORDPRESS',
      legacySourceSystem: 'WORDPRESS',
      legacyRecordId: 'wp-post-12345',
      legacyVerificationUrl: 'https://verify.example.test/certificate?id=ABC123',
      registration: { id: s.registrationId, registrationNumber: s.registrationNumber },
      file: { contentType: 'application/pdf', originalFilename: 'passwd.pdf' },
    });
    const row = await testDb().historicalDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row.storageKey).toMatch(
      new RegExp(`^documents/${s.registrationId}/[0-9a-f-]{36}\\.pdf$`),
    );
    // Original bytes are kept unchanged (evidence fidelity) and identified by SHA-256.
    expect(
      Buffer.from(storage.objects.get(row.storageKey)?.body ?? []).equals(original.bytes),
    ).toBe(true);
    expect(JSON.stringify(doc)).not.toContain(row.storageKey);
    // A draft is invisible to the student.
    expect(await studentDocs(s.agent)).toEqual([]);
    expect((await s.agent.get(`/api/v1/student/documents/${doc.id}/file`)).status).toBe(404);
  });

  it.each([
    [
      'JavaScript',
      {
        bytes: staticPdf('5 0 obj << /S /JavaScript /JS (x) >> endobj'),
        contentType: 'application/pdf',
      },
    ],
    [
      'a compressed hidden script',
      { bytes: pdfWithCompressedScript(), contentType: 'application/pdf' },
    ],
    [
      'HTML posing as a PDF',
      { bytes: Buffer.from('<html><script>x</script></html>'), contentType: 'application/pdf' },
    ],
    [
      'an SVG',
      {
        bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        contentType: 'image/svg+xml',
      },
    ],
  ])('refuses %s and stores nothing', async (_name, file) => {
    const s = await activatedStudent(app, registrar, 'HBAD');
    const before = storage.objects.size;
    const response = await upload(registrar, metadata(s.registrationId), file);
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('UNSUPPORTED_FILE');
    expect(storage.objects.size).toBe(before);
    expect(
      await testDb().historicalDocument.count({
        where: { studentRegistrationId: s.registrationId },
      }),
    ).toBe(0);
  });

  it('validates metadata, the registration, file size and duplicates', async () => {
    const s = await activatedStudent(app, registrar, 'HVAL');
    for (const [extra, path] of [
      [{ documentType: 'PASSPORT' }, 'documentType'],
      [{ title: '' }, 'title'],
      [{ issuedOn: 'yesterday' }, 'issuedOn'],
      [{ legacyVerificationUrl: 'javascript:alert(1)' }, 'legacyVerificationUrl'],
      [{ studentRegistrationId: '01900000-0000-7000-8000-000000000000' }, 'studentRegistrationId'],
    ] as const) {
      const response = await upload(registrar, { ...metadata(s.registrationId), ...extra }, pdf());
      expect(response.status, JSON.stringify(extra)).toBe(400);
      expect(errorOf(response).details?.map((d) => d.path)).toContain(path);
    }
    // Unknown fields (e.g. an attempt to pass a student id) are refused, named in the message.
    const unknown = await upload(
      registrar,
      { ...metadata(s.registrationId), studentId: 'x' },
      pdf(),
    );
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(errorOf(unknown).details)).toContain('studentId');
    expect((await upload(registrar, metadata(s.registrationId), null)).status).toBe(400);
    const tooBig = await upload(registrar, metadata(s.registrationId), {
      bytes: Buffer.alloc(15 * 1024 * 1024 + 1, 1),
      contentType: 'application/pdf',
    });
    expect(tooBig.status).toBe(413);
    const file = pdf('DUP');
    await draftFor(s.registrationId, registrar, file);
    const dup = await upload(registrar, metadata(s.registrationId), file);
    expect(dup.status).toBe(409);
    expect(errorOf(dup).message).toMatch(/already on record/);
  });

  it('accepts JPEG/PNG scans', async () => {
    const s = await activatedStudent(app, registrar, 'HIMG');
    const png = await draftFor(s.registrationId, registrar, {
      bytes: await scans.png(),
      contentType: 'image/png',
      filename: 'scan.png',
    });
    expect(png.file.contentType).toBe('image/png');
  });
});

describe('authorization', () => {
  it('limits every action to the right staff permission, and keeps students out', async () => {
    const s = await activatedStudent(app, registrar, 'HRBAC');
    // CERTIFICATE_ADMIN prepares (uploads) but cannot publish; APPROVER publishes but cannot upload.
    const doc = await draftFor(s.registrationId, certAdmin);
    expect((await certAdmin.post(`historical-documents/${doc.id}/publish`)).status).toBe(403);
    expect((await upload(approver, metadata(s.registrationId), pdf())).status).toBe(403);
    for (const member of [viewer, examAdmin]) {
      expect((await member.get('historical-documents')).status).toBe(403);
      expect((await member.get(`historical-documents/${doc.id}`)).status).toBe(403);
      expect((await member.get(`historical-documents/${doc.id}/file`)).status).toBe(403);
      expect((await upload(member, metadata(s.registrationId), pdf())).status).toBe(403);
      expect((await member.post(`historical-documents/${doc.id}/publish`)).status).toBe(403);
      expect(
        (
          await member.post(`historical-documents/${doc.id}/withdraw`, {
            reason: 'Not allowed here.',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await member.post(`historical-documents/${doc.id}/authenticity`, {
            authenticity: 'DISPUTED',
            note: 'Not allowed.',
          })
        ).status,
      ).toBe(403);
    }
    // No CSRF token → refused before the file is read.
    const noCsrf = await registrar.agent
      .post('/api/v1/historical-documents')
      .field('studentRegistrationId', s.registrationId)
      .attach('file', pdf().bytes, { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(noCsrf.status).toBe(403);
    // Students can never reach staff endpoints, and have no upload/edit/publish routes at all.
    expect((await s.agent.get('/api/v1/historical-documents')).status).toBe(401);
    expect((await s.agent.get(`/api/v1/historical-documents/${doc.id}/file`)).status).toBe(401);
    const token = ((await s.agent.get('/api/v1/student-auth/csrf')).body as { csrfToken: string })
      .csrfToken;
    for (const [method, path] of [
      ['post', '/api/v1/student/documents'],
      ['patch', `/api/v1/student/documents/${doc.id}`],
      ['post', `/api/v1/student/documents/${doc.id}/publish`],
      ['delete', `/api/v1/student/documents/${doc.id}`],
    ] as const) {
      const response = await s.agent[method](path).set('X-CSRF-Token', token).send({});
      expect(response.status, `${method} ${path}`).toBe(404);
    }
    expect(
      (await testDb().historicalDocument.findUniqueOrThrow({ where: { id: doc.id } })).status,
    ).toBe('DRAFT');
  });
});

describe('publication, ownership and downloads', () => {
  it('shows only published documents to their own student, with safe download headers', async () => {
    const owner = await activatedStudent(app, registrar, 'HOWN');
    const intruder = await activatedStudent(app, registrar, 'HINT');
    const doc = await draftFor(owner.registrationId);
    const published = detailOf(
      (await approver.post(`historical-documents/${doc.id}/publish`).expect(200)).body,
    );
    expect(published).toMatchObject({ status: 'PUBLISHED', publishedBy: { id: approver.user.id } });

    const mine = await studentDocs(owner.agent);
    expect(mine.map((d) => d.id)).toEqual([doc.id]);
    expect(mine[0]).toMatchObject({
      authenticity: 'UNVERIFIED',
      certificateNumber: 'LEG/2019/00042',
    });
    expect(JSON.stringify(mine)).not.toMatch(
      /storage|documents\/|uploadedBy|provenanceNote|wp-post/,
    );

    const download = await owner.agent
      .get(`/api/v1/student/documents/${doc.id}/file`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toMatch(
      /^attachment; filename="historical-document-[0-9a-f]{8}\.pdf"$/,
    );
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-security-policy']).toContain("default-src 'none'");
    expect((download.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const inline = await owner.agent
      .get(`/api/v1/student/documents/${doc.id}/file?disposition=inline`)
      .expect(200);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);
    expect(
      (await owner.agent.get(`/api/v1/student/documents/${doc.id}/file?disposition=evil`)).status,
    ).toBe(400);

    // Another student: nothing listed, not found.
    expect(await studentDocs(intruder.agent)).toEqual([]);
    expect((await intruder.agent.get(`/api/v1/student/documents/${doc.id}/file`)).status).toBe(404);
    expect((await browser(app).get(`/api/v1/student/documents/${doc.id}/file`)).status).toBe(401);

    const audit = await testDb().auditLog.findMany({
      where: {
        entityType: 'HistoricalDocument',
        entityId: doc.id,
        action: 'HISTORICAL_DOCUMENT_DOWNLOADED',
      },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]?.actorUserId).toBeNull();
    expect(audit[0]?.metadata).toMatchObject({ principal: 'student', studentId: owner.studentId });
  });

  it('withdraws with a reason (hidden, kept) and can publish again', async () => {
    const s = await activatedStudent(app, registrar, 'HWD');
    const doc = await draftFor(s.registrationId);
    await registrar.post(`historical-documents/${doc.id}/publish`).expect(200);
    for (const body of [{}, { reason: '' }, { reason: 'abc' }]) {
      expect((await registrar.post(`historical-documents/${doc.id}/withdraw`, body)).status).toBe(
        400,
      );
    }
    const withdrawn = detailOf(
      (
        await registrar
          .post(`historical-documents/${doc.id}/withdraw`, {
            reason: 'Uploaded to the wrong registration.',
          })
          .expect(200)
      ).body,
    );
    expect(withdrawn).toMatchObject({
      status: 'WITHDRAWN',
      withdrawalReason: 'Uploaded to the wrong registration.',
    });
    expect(await studentDocs(s.agent)).toEqual([]);
    expect((await s.agent.get(`/api/v1/student/documents/${doc.id}/file`)).status).toBe(404);
    expect(await testDb().historicalDocument.count({ where: { id: doc.id } })).toBe(1);
    // Published documents cannot be edited in place.
    await registrar.post(`historical-documents/${doc.id}/publish`).expect(200);
    const edit = await registrar.patch(`historical-documents/${doc.id}`, { title: 'Changed' });
    expect(edit.status).toBe(409);
    expect(errorOf(edit).code).toBe('DOCUMENT_NOT_EDITABLE');
    const audit = await testDb().auditLog.findMany({
      where: { entityType: 'HistoricalDocument', entityId: doc.id },
    });
    expect(JSON.stringify(audit)).not.toContain('wrong registration');
  });

  it('replaces a published document without deleting the original', async () => {
    const s = await activatedStudent(app, registrar, 'HREP');
    const original = await draftFor(s.registrationId);
    // A draft is edited, not replaced.
    expect(
      (await upload(registrar, {}, pdf(), `historical-documents/${original.id}/replace`)).status,
    ).toBe(409);
    await registrar
      .patch(`historical-documents/${original.id}`, { title: 'Degree certificate (corrected)' })
      .expect(200);
    await registrar.post(`historical-documents/${original.id}/publish`).expect(200);

    const replacementResponse = await upload(
      registrar,
      { certificateNumber: 'LEG/2019/00042-R' },
      pdf('REPLACEMENT'),
      `historical-documents/${original.id}/replace`,
    );
    expect(replacementResponse.status, JSON.stringify(replacementResponse.body)).toBe(201);
    const replacement = detailOf(replacementResponse.body);
    expect(replacement).toMatchObject({
      status: 'DRAFT',
      title: 'Degree certificate (corrected)',
      certificateNumber: 'LEG/2019/00042-R',
      replaces: { id: original.id, status: 'PUBLISHED' },
      legacyRecordId: 'wp-post-12345',
    });
    // Until the replacement is published the student still sees the original.
    expect((await studentDocs(s.agent)).map((d) => d.id)).toEqual([original.id]);
    // The original cannot be republished/replaced again while a live replacement exists.
    expect(
      (await upload(registrar, {}, pdf(), `historical-documents/${original.id}/replace`)).status,
    ).toBe(409);

    await registrar.post(`historical-documents/${replacement.id}/publish`).expect(200);
    expect((await studentDocs(s.agent)).map((d) => d.id)).toEqual([replacement.id]);
    const old = detailOf(
      (await registrar.get(`historical-documents/${original.id}`).expect(200)).body,
    );
    expect(old).toMatchObject({
      status: 'SUPERSEDED',
      replacedBy: { id: replacement.id, status: 'PUBLISHED' },
    });
    expect((await registrar.get(`historical-documents/${original.id}/file`)).status).toBe(200);
    expect(old.history.map((h) => h.action)).toEqual(
      expect.arrayContaining([
        'HISTORICAL_DOCUMENT_UPLOADED',
        'HISTORICAL_DOCUMENT_PUBLISHED',
        'HISTORICAL_DOCUMENT_REPLACED',
      ]),
    );
    expect(
      (
        await registrar.post(`historical-documents/${original.id}/withdraw`, {
          reason: 'Superseded already.',
        })
      ).status,
    ).toBe(409);
  });

  it('flags the same certificate number on another registration', async () => {
    const a = await activatedStudent(app, registrar, 'HNA');
    const b = await activatedStudent(app, registrar, 'HNB');
    const first = await draftFor(a.registrationId);
    const second = await draftFor(b.registrationId);
    const detail = detailOf((await registrar.get(`historical-documents/${second.id}`)).body);
    expect(detail.sameNumberElsewhere).toEqual(
      expect.arrayContaining([
        { id: first.id, registrationNumber: a.registrationNumber, status: 'DRAFT' },
      ]),
    );
    const list = historicalDocumentListSchema.parse(
      (
        await registrar.get(
          `historical-documents?search=${encodeURIComponent(b.registrationNumber)}`,
        )
      ).body,
    );
    expect(list.data.map((d) => d.id)).toEqual([second.id]);
  });
});

describe('authenticity is separate from visibility', () => {
  it('needs a reviewer other than the uploader and never claims cryptographic verification', async () => {
    const s = await activatedStudent(app, registrar, 'HAUTH');
    const doc = await draftFor(s.registrationId, registrar);
    const self = await registrar.post(`historical-documents/${doc.id}/authenticity`, {
      authenticity: 'CONFIRMED_AGAINST_RECORDS',
      note: 'Matched the 2019 convocation register.',
    });
    expect(self.status).toBe(403);
    expect(errorOf(self).message).toMatch(/uploaded a document cannot review/);
    expect(
      (
        await approver.post(`historical-documents/${doc.id}/authenticity`, {
          authenticity: 'VERIFIED',
          note: 'Looks fine.',
        })
      ).status,
    ).toBe(400);
    const reviewed = detailOf(
      (
        await approver
          .post(`historical-documents/${doc.id}/authenticity`, {
            authenticity: 'CONFIRMED_AGAINST_RECORDS',
            note: 'Matched the 2019 convocation register.',
          })
          .expect(200)
      ).body,
    );
    expect(reviewed).toMatchObject({
      status: 'DRAFT',
      authenticity: 'CONFIRMED_AGAINST_RECORDS',
      authenticityReviewedBy: { id: approver.user.id },
    });
    // Verified but not published → still invisible to the student.
    expect(await studentDocs(s.agent)).toEqual([]);
    await approver.post(`historical-documents/${doc.id}/publish`).expect(200);
    const [visible] = await studentDocs(s.agent);
    expect(visible?.authenticity).toBe('CONFIRMED_AGAINST_RECORDS');
    expect(JSON.stringify(visible)).not.toMatch(/convocation register|cryptograph/i);
  });
});

describe('concurrency and storage failures', () => {
  it('lets exactly one of concurrent publish/withdraw decisions win', async () => {
    const s = await activatedStudent(app, registrar, 'HRACE');
    const doc = await draftFor(s.registrationId);
    const results = await Promise.all([
      registrar.post(`historical-documents/${doc.id}/publish`),
      approver.post(`historical-documents/${doc.id}/publish`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('returns 503 and records nothing when storage is down', async () => {
    const failing = new MemoryObjectStorage();
    failing.putObject = () => Promise.reject(new Error('simulated outage'));
    failing.getObject = () => Promise.reject(new Error('simulated outage'));
    const outage = await createTestApp(realConfig(), { objectStorage: failing });
    try {
      const member = await staff(outage, ['REGISTRAR']);
      const s = await activatedStudent(outage, member, 'HOUT');
      const response = await upload(member, metadata(s.registrationId), pdf());
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain('simulated');
      expect(
        await testDb().historicalDocument.count({
          where: { studentRegistrationId: s.registrationId },
        }),
      ).toBe(0);
    } finally {
      await outage.close();
    }
  });
});
