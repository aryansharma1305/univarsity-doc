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
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { backfillStudentCopies } from '../../src/historical-documents/student-copy-backfill.js';
import {
  containsEmbeddedValue,
  jpegWithEmbeddedMetadata,
  pdfWithCompressedScript,
  scans,
  staticPdf,
} from './support.js';

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

// ---------------------------------------------------------------------------------------------
// Phase 8 hardening
// ---------------------------------------------------------------------------------------------

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Fetches a file response as bytes. */
function fileOf(request: ReturnType<Agent['get']>) {
  return request.buffer(true).parse(binaryParser);
}

const studentFile = (agent: Agent, id: string, disposition: 'inline' | 'attachment') =>
  fileOf(agent.get(`/api/v1/student/documents/${id}/file?disposition=${disposition}`));

const staffFile = (member: Staff, id: string, variant: 'original' | 'student') =>
  fileOf(member.agent.get(`/api/v1/historical-documents/${id}/file?variant=${variant}`));

async function imageDraft(registrationId: string, bytes: Buffer, member: Staff = certAdmin) {
  const response = await upload(
    member,
    metadata(registrationId, {
      documentType: 'PROVISIONAL_CERTIFICATE',
      certificateNumber: 'IMG-0001',
    }),
    { bytes, contentType: 'image/jpeg', filename: 'scan.jpg' },
  );
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return detailOf(response.body);
}

/** An image row as it existed before the hardening migration: original only, no student copy. */
async function legacyImageRow(registrationId: string, bytes: Buffer, uploaderId: string) {
  const key = `documents/${registrationId}/${randomUUIDv4()}.jpg`;
  await storage.putObject(key, bytes, { contentType: 'image/jpeg' });
  return testDb().historicalDocument.create({
    data: {
      studentRegistrationId: registrationId,
      documentType: 'MARKSHEET',
      title: 'Legacy scan without a student copy (synthetic)',
      provenance: 'UNIVERSITY_ARCHIVE',
      storageKey: key,
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
      originalFilename: 'legacy.jpg',
      uploadedByUserId: uploaderId,
    },
  });
}

function randomUUIDv4() {
  return globalThis.crypto.randomUUID();
}

describe('image student copies (embedded metadata never reaches students)', () => {
  it('keeps the original as evidence and serves only the metadata-free copy for preview AND download', async () => {
    const s = await activatedStudent(app, registrar, 'HEXIF');
    const original = await jpegWithEmbeddedMetadata();
    const doc = await imageDraft(s.registrationId, original);

    // Staff are told what kinds of metadata the original carries — never the values.
    expect(doc.embeddedMetadata).toEqual({
      inspected: true,
      categories: ['LOCATION', 'DEVICE', 'PERSON', 'TEXT', 'OTHER'],
    });
    expect(containsEmbeddedValue(Buffer.from(JSON.stringify(doc)))).toBeUndefined();
    expect(doc.studentCopy.status).toBe('READY');
    expect(doc.studentCopy.sha256).not.toBe(doc.file.sha256);
    expect(doc.file.sha256).toBe(sha256(original));

    // Separate private objects: the original is byte-identical to the upload.
    const row = await testDb().historicalDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row.studentCopyStorageKey).toMatch(
      new RegExp(`^documents/${s.registrationId}/student-copy-[0-9a-f-]{36}\\.jpg$`),
    );
    expect(row.studentCopyStorageKey).not.toBe(row.storageKey);
    expect(Buffer.from(storage.objects.get(row.storageKey)?.body ?? []).equals(original)).toBe(
      true,
    );
    const audit = await testDb().auditLog.findMany({ where: { entityId: doc.id } });
    expect(containsEmbeddedValue(Buffer.from(JSON.stringify(audit)))).toBeUndefined();

    await approver.post(`historical-documents/${doc.id}/publish`).expect(200);
    for (const disposition of ['inline', 'attachment'] as const) {
      const response = await studentFile(s.agent, doc.id, disposition).expect(200);
      const bytes = response.body as Buffer;
      expect(sha256(bytes)).toBe(doc.studentCopy.sha256);
      expect(containsEmbeddedValue(bytes)).toBeUndefined();
      expect(bytes.toString('latin1')).not.toContain('Exif\0\0');
      const meta = await sharp(bytes).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect([meta.width, meta.height]).toEqual([900, 1200]); // upright, not resized
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['content-disposition']).toMatch(
        new RegExp(`^${disposition}; filename="historical-document-[0-9a-f]{8}\\.jpg"$`),
      );
    }
    const listed = (await studentDocs(s.agent)).find((d) => d.id === doc.id);
    expect(listed).toMatchObject({ available: true, sizeBytes: doc.studentCopy.sizeBytes });

    // Staff: the evidential original exactly as uploaded, or exactly what the student receives.
    const evidence = (await staffFile(registrar, doc.id, 'original').expect(200)).body as Buffer;
    expect(evidence.equals(original)).toBe(true);
    const studentView = (await staffFile(registrar, doc.id, 'student').expect(200)).body as Buffer;
    expect(sha256(studentView)).toBe(doc.studentCopy.sha256);
    // Read access to either file stays permission-restricted.
    for (const member of [viewer, examAdmin]) {
      expect((await staffFile(member, doc.id, 'original')).status).toBe(403);
      expect((await staffFile(member, doc.id, 'student')).status).toBe(403);
    }
    expect((await s.agent.get(`/api/v1/historical-documents/${doc.id}/file`)).status).toBe(401);
    expect(
      (await registrar.get(`historical-documents/${doc.id}/file?variant=thumbnail`)).status,
    ).toBe(400);
  });

  it('never falls back to the original when the copy is missing or altered', async () => {
    const s = await activatedStudent(app, registrar, 'HMISS');
    const original = await jpegWithEmbeddedMetadata();
    const doc = await imageDraft(s.registrationId, original);
    await approver.post(`historical-documents/${doc.id}/publish`).expect(200);
    const row = await testDb().historicalDocument.findUniqueOrThrow({ where: { id: doc.id } });
    const copyKey = row.studentCopyStorageKey ?? '';
    const saved = storage.objects.get(copyKey);
    try {
      // Missing object.
      storage.objects.delete(copyKey);
      for (const disposition of ['inline', 'attachment'] as const) {
        const response = await studentFile(s.agent, doc.id, disposition);
        expect(response.status).toBe(503);
        expect(containsEmbeddedValue(response.body as Buffer)).toBeUndefined();
      }
      // Replaced by the original (or anything else): checksum mismatch → refused.
      storage.objects.set(copyKey, { body: new Uint8Array(original), contentType: 'image/jpeg' });
      const tampered = await studentFile(s.agent, doc.id, 'inline');
      expect(tampered.status).toBe(503);
      expect(containsEmbeddedValue(tampered.body as Buffer)).toBeUndefined();
      expect((await staffFile(registrar, doc.id, 'student')).status).toBe(503);
    } finally {
      if (saved) storage.objects.set(copyKey, saved);
    }
    expect((await studentFile(s.agent, doc.id, 'inline')).status).toBe(200);
  });

  it('applies ownership, draft, withdrawal and replacement rules to image files', async () => {
    const owner = await activatedStudent(app, registrar, 'HIOWN');
    const other = await activatedStudent(app, registrar, 'HIOTH');
    const doc = await imageDraft(owner.registrationId, await jpegWithEmbeddedMetadata());
    const both = async (agent: Agent, id: string) =>
      Promise.all([
        studentFile(agent, id, 'inline').then((r) => r.status),
        studentFile(agent, id, 'attachment').then((r) => r.status),
      ]);

    expect(await both(owner.agent, doc.id)).toEqual([404, 404]); // draft
    await approver.post(`historical-documents/${doc.id}/publish`).expect(200);
    expect(await both(owner.agent, doc.id)).toEqual([200, 200]);
    expect(await both(other.agent, doc.id)).toEqual([404, 404]); // another student's

    await approver
      .post(`historical-documents/${doc.id}/withdraw`, { reason: 'Synthetic withdrawal test' })
      .expect(200);
    expect(await both(owner.agent, doc.id)).toEqual([404, 404]); // withdrawn
    await approver.post(`historical-documents/${doc.id}/publish`).expect(200);

    const replacement = detailOf(
      (
        await upload(
          certAdmin,
          {},
          { bytes: await scans.jpeg(820, 1100), contentType: 'image/jpeg', filename: 'fixed.jpg' },
          `historical-documents/${doc.id}/replace`,
        ).expect(201)
      ).body,
    );
    expect(replacement.studentCopy.status).toBe('READY');
    expect(await both(owner.agent, replacement.id)).toEqual([404, 404]); // replacement draft
    await approver.post(`historical-documents/${replacement.id}/publish`).expect(200);
    expect(await both(owner.agent, doc.id)).toEqual([404, 404]); // superseded
    expect(await both(owner.agent, replacement.id)).toEqual([200, 200]);
    // The superseded original stays available to authorised staff as evidence.
    expect((await staffFile(registrar, doc.id, 'original')).status).toBe(200);
  });

  it('backfills older image documents safely and repeatably before they can be published', async () => {
    const s = await activatedStudent(app, registrar, 'HBACK');
    const original = await jpegWithEmbeddedMetadata();
    const legacy = await legacyImageRow(s.registrationId, original, certAdmin.user.id);

    // No copy yet: not publishable, nothing served — never the original.
    const blocked = await approver.post(`historical-documents/${legacy.id}/publish`);
    expect(blocked.status).toBe(409);
    expect(errorOf(blocked).code).toBe('DOCUMENT_NOT_READY');
    expect((await staffFile(registrar, legacy.id, 'student')).status).toBe(409);
    const before = detailOf(
      (await registrar.get(`historical-documents/${legacy.id}`).expect(200)).body,
    );
    expect(before.studentCopy.status).toBe('PENDING');
    expect(before.embeddedMetadata.inspected).toBe(false);

    // Dry run: checks everything, stores and changes nothing.
    const objects = storage.objects.size;
    const dry = await backfillStudentCopies(testDb(), storage, { dryRun: true });
    expect(dry.items.find((item) => item.id === legacy.id)?.outcome).toBe('WOULD_CREATE');
    expect(storage.objects.size).toBe(objects);

    // An image whose stored original no longer matches its checksum is reported, never used.
    const altered = await legacyImageRow(
      s.registrationId,
      await scans.jpeg(700, 900),
      certAdmin.user.id,
    );
    storage.objects.set(altered.storageKey, {
      body: new Uint8Array(await scans.jpeg(701, 900)),
      contentType: 'image/jpeg',
    });

    const first = await backfillStudentCopies(testDb(), storage);
    expect(first.items.find((item) => item.id === legacy.id)?.outcome).toBe('CREATED');
    expect(first.items.find((item) => item.id === altered.id)?.outcome).toBe('ORIGINAL_CHANGED');
    expect(first.failed).toBe(true);
    const second = await backfillStudentCopies(testDb(), storage);
    expect(second.items.find((item) => item.id === legacy.id)).toBeUndefined(); // repeatable
    expect(second.items.find((item) => item.id === altered.id)?.outcome).toBe('ORIGINAL_CHANGED');

    const after = detailOf(
      (await registrar.get(`historical-documents/${legacy.id}`).expect(200)).body,
    );
    expect(after.studentCopy.status).toBe('READY');
    expect(after.embeddedMetadata.categories).toContain('LOCATION');
    expect(after.file.sha256).toBe(sha256(original)); // the original record is unchanged
    expect(after.history.map((h) => [h.action, h.actor])).toContainEqual([
      'HISTORICAL_DOCUMENT_STUDENT_COPY_CREATED',
      null,
    ]);
    await approver.post(`historical-documents/${legacy.id}/publish`).expect(200);
    const delivered = (await studentFile(s.agent, legacy.id, 'attachment').expect(200))
      .body as Buffer;
    expect(containsEmbeddedValue(delivered)).toBeUndefined();
    const evidence = storage.objects.get(legacy.storageKey)?.body ?? new Uint8Array();
    expect(Buffer.from(evidence).equals(original)).toBe(true);
  });

  it('tells students an older published image is being prepared, and serves nothing meanwhile', async () => {
    const s = await activatedStudent(app, registrar, 'HPREP');
    const legacy = await legacyImageRow(
      s.registrationId,
      await scans.jpeg(640, 900),
      certAdmin.user.id,
    );
    // Simulate a row published before the hardening migration (now impossible through the API).
    const db = testDb();
    await db.$executeRawUnsafe(
      'ALTER TABLE historical_documents DISABLE TRIGGER historical_documents_hardening_guard',
    );
    try {
      await db.historicalDocument.update({
        where: { id: legacy.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedByUserId: approver.user.id },
      });
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE historical_documents ENABLE TRIGGER historical_documents_hardening_guard',
      );
    }
    expect((await studentDocs(s.agent)).find((d) => d.id === legacy.id)?.available).toBe(false);
    const response = await studentFile(s.agent, legacy.id, 'inline');
    expect(response.status).toBe(409);
    expect(errorOf({ body: JSON.parse((response.body as Buffer).toString('utf8')) }).code).toBe(
      'DOCUMENT_NOT_READY',
    );
  });
});

describe('certificate numbers: exact original value plus a normalised search form', () => {
  it('stores the number exactly as given and searches/flags duplicates by its normalised form', async () => {
    const a = await activatedStudent(app, registrar, 'HNUMA');
    const b = await activatedStudent(app, registrar, 'HNUMB');
    const raw = '  ACC/Cert/1001 ';
    const first = detailOf(
      (await upload(certAdmin, metadata(a.registrationId, { certificateNumber: raw }), pdf())).body,
    );
    expect(first.certificateNumber).toBe(raw);
    expect(first.certificateNumberNormalized).toBe('ACCCERT1001');
    const row = await testDb().historicalDocument.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.certificateNumber).toBe(raw);

    // Differently printed, same number, on another registration → flagged; both kept verbatim.
    const second = detailOf(
      (
        await upload(
          certAdmin,
          metadata(b.registrationId, { certificateNumber: 'ＡＣＣ－ＣＥＲＴ－１００１' }),
          pdf(),
        )
      ).body,
    );
    expect(second.certificateNumber).toBe('ＡＣＣ－ＣＥＲＴ－１００１');
    expect(second.sameNumberElsewhere.map((o) => o.id)).toEqual([first.id]);

    for (const search of ['acc cert 1001', 'ACC-CERT-1001', 'Cert/10']) {
      const list = historicalDocumentListSchema.parse(
        (
          await registrar
            .get(`historical-documents?search=${encodeURIComponent(search)}`)
            .expect(200)
        ).body,
      );
      expect(
        list.data.map((d) => d.id),
        search,
      ).toContain(first.id);
    }

    await approver.post(`historical-documents/${first.id}/publish`).expect(200);
    expect((await studentDocs(a.agent)).find((d) => d.id === first.id)?.certificateNumber).toBe(
      raw,
    );
  });

  it('refuses invisible/control characters instead of silently changing the number', async () => {
    const s = await activatedStudent(app, registrar, 'HNUMX');
    for (const bad of ['ACC\n1001', 'ACC\t1001', 'ACC‮1001', '///']) {
      const response = await upload(
        certAdmin,
        metadata(s.registrationId, { certificateNumber: bad }),
        pdf(),
      );
      expect(response.status, JSON.stringify(bad)).toBe(400);
    }
    const blank = detailOf(
      (await upload(certAdmin, metadata(s.registrationId, { certificateNumber: '   ' }), pdf()))
        .body,
    );
    expect([blank.certificateNumber, blank.certificateNumberNormalized]).toEqual([null, null]);
    const edited = detailOf(
      (
        await certAdmin
          .patch(`historical-documents/${blank.id}`, { certificateNumber: 'No. 77-B ' })
          .expect(200)
      ).body,
    );
    expect([edited.certificateNumber, edited.certificateNumberNormalized]).toEqual([
      'No. 77-B ',
      'NO77B',
    ]);
  });
});

describe('replacement chains identify every version', () => {
  it('numbers revisions and gives each version a distinct reference, even with identical titles', async () => {
    const s = await activatedStudent(app, registrar, 'HCHAIN');
    const original = await draftFor(s.registrationId);
    await approver.post(`historical-documents/${original.id}/publish`).expect(200);
    const replace = () =>
      upload(certAdmin, {}, pdf(), `historical-documents/${original.id}/replace`).expect(201);
    // A first replacement attempt that is withdrawn, then the real one.
    const abandoned = detailOf((await replace()).body);
    await approver
      .post(`historical-documents/${abandoned.id}/withdraw`, { reason: 'Wrong file attached' })
      .expect(200);
    const replacement = detailOf((await replace()).body);
    await approver.post(`historical-documents/${replacement.id}/publish`).expect(200);

    const current = detailOf(
      (await registrar.get(`historical-documents/${replacement.id}`).expect(200)).body,
    );
    const old = detailOf(
      (await registrar.get(`historical-documents/${original.id}`).expect(200)).body,
    );
    expect(current.title).toBe(old.title); // identical titles…
    expect(current.reference).not.toBe(old.reference); // …but distinct references
    expect(current.reference).toMatch(/^HD-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(current.revision).toBe(2);
    expect(old.revision).toBe(1);
    expect(current.replaces).toMatchObject({
      id: original.id,
      reference: old.reference,
      revision: 1,
      status: 'SUPERSEDED',
      certificateNumber: 'LEG/2019/00042',
    });
    expect(old.replacedBy).toMatchObject({ id: replacement.id, revision: 2, status: 'PUBLISHED' });
    expect(current.versions.map((v) => [v.id, v.revision, v.status])).toEqual([
      [original.id, 1, 'SUPERSEDED'],
      [abandoned.id, 2, 'WITHDRAWN'],
      [replacement.id, 2, 'PUBLISHED'],
    ]);
    expect(new Set(current.versions.map((v) => v.reference)).size).toBe(3);
    expect(old.versions).toEqual(current.versions);
    const rows = historicalDocumentListSchema.parse(
      (
        await registrar
          .get(`historical-documents?studentRegistrationId=${s.registrationId}`)
          .expect(200)
      ).body,
    ).data;
    expect(rows.find((r) => r.id === replacement.id)).toMatchObject({ isReplacement: true });
    expect(rows.find((r) => r.id === original.id)).toMatchObject({ isReplacement: false });
  });
});
