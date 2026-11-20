import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from '@docversity/storage';
import { studentUploadListSchema, studentUploadSchema } from '@docversity/validation';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent, studentCsrf } from '../student-auth/support.js';
import { EMBEDDED, jpegWithEmbeddedMetadata, staticPdf } from '../historical-documents/support.js';

let app: INestApplication;
let registrar: Staff;
let superAdmin: Staff;
let viewer: Staff;
let examAdmin: Staff;
const storage = new MemoryObjectStorage();

beforeAll(async () => {
  app = await createTestApp(realConfig(), { objectStorage: storage });
  [registrar, superAdmin, viewer, examAdmin] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['SUPER_ADMIN']),
    staff(app, ['VIEWER']),
    staff(app, ['EXAM_ADMIN']),
  ]);
});
afterAll(async () => {
  await app.close();
});

type Agent = ReturnType<typeof browser>;

async function upload(
  agent: Agent,
  category: string,
  bytes: Buffer,
  contentType: string,
  csrf = true,
) {
  let req = agent.post(`/api/v1/student/uploads/${category}`);
  if (csrf) req = req.set('X-CSRF-Token', await studentCsrf(agent));
  return req.attach('file', bytes, { filename: 'ABCDE1234F passport.pdf', contentType });
}

async function remove(agent: Agent, category: string) {
  return agent
    .delete(`/api/v1/student/uploads/${category}`)
    .set('X-CSRF-Token', await studentCsrf(agent));
}

const auditsFor = (entityId: string) =>
  testDb().auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });

describe('student uploads: owning student', () => {
  it('uploads, replaces and deletes a file, auditing IDs and the category only', async () => {
    const s = await activatedStudent(app, registrar, 'UPL');
    const pdf = staticPdf();
    const created = await upload(s.agent, 'IDENTITY_PASSPORT', pdf, 'application/pdf');
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const first = studentUploadSchema.parse(created.body);
    expect(first).toMatchObject({ category: 'IDENTITY_PASSPORT', contentType: 'application/pdf' });
    expect(JSON.stringify(created.body)).not.toMatch(/storage|ABCDE1234F|passport\.pdf/);

    const row = await testDb().studentUpload.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.storageKey).toMatch(
      new RegExp(`^students/${s.studentId}/uploads/[0-9a-f-]{36}\\.pdf$`),
    );
    const own = await s.agent
      .get('/api/v1/student/uploads/IDENTITY_PASSPORT/file?disposition=inline')
      .expect(200);
    expect(own.headers['cache-control']).toBe('private, no-store');
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(own.headers['content-disposition']).toBe('inline; filename="identity-passport.pdf"');
    expect(Buffer.from(own.body as Buffer).equals(pdf)).toBe(true);

    // Replace with an image: stored only as a re-encoded copy without metadata; old object gone.
    const replaced = await upload(
      s.agent,
      'IDENTITY_PASSPORT',
      await jpegWithEmbeddedMetadata(),
      'image/jpeg',
    );
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(201);
    expect(studentUploadSchema.parse(replaced.body).id).toBe(first.id);
    const after = await testDb().studentUpload.findUniqueOrThrow({ where: { id: first.id } });
    expect(storage.objects.has(row.storageKey)).toBe(false);
    const stored = Buffer.from(storage.objects.get(after.storageKey)?.body ?? new Uint8Array());
    for (const value of Object.values(EMBEDDED)) expect(stored.includes(value)).toBe(false);
    expect((await sharp(stored).metadata()).exif).toBeUndefined();

    const list = studentUploadListSchema.parse(
      (await s.agent.get('/api/v1/student/uploads').expect(200)).body,
    );
    expect(list.data.map((item) => item.category)).toEqual(['IDENTITY_PASSPORT']);

    expect((await remove(s.agent, 'IDENTITY_PASSPORT')).status).toBe(204);
    expect(storage.objects.has(after.storageKey)).toBe(false);
    expect((await remove(s.agent, 'IDENTITY_PASSPORT')).status).toBe(404);
    expect(
      studentUploadListSchema.parse((await s.agent.get('/api/v1/student/uploads').expect(200)).body)
        .data,
    ).toEqual([]);

    const audits = await auditsFor(first.id);
    expect(audits.map((entry) => entry.action)).toEqual([
      'STUDENT_UPLOAD_SAVED',
      'STUDENT_UPLOAD_SAVED',
      'STUDENT_UPLOAD_DELETED',
    ]);
    expect(audits.map((entry) => entry.metadata)).toEqual([
      {
        studentId: s.studentId,
        accountId: s.me.account.id,
        category: 'IDENTITY_PASSPORT',
        replaced: false,
      },
      {
        studentId: s.studentId,
        accountId: s.me.account.id,
        category: 'IDENTITY_PASSPORT',
        replaced: true,
      },
      { studentId: s.studentId, accountId: s.me.account.id, category: 'IDENTITY_PASSPORT' },
    ]);
  });

  it('refuses unsafe input, unknown categories, missing CSRF and anonymous access', async () => {
    const s = await activatedStudent(app, registrar, 'UPL');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect((await upload(s.agent, 'ACADEMIC_CLASS_10', svg, 'image/svg+xml')).status).toBe(400);
    expect((await upload(s.agent, 'AADHAAR', staticPdf(), 'application/pdf')).status).toBe(400);
    expect(
      (await upload(s.agent, 'ACADEMIC_CLASS_10', staticPdf(), 'application/pdf', false)).status,
    ).toBe(403);
    expect((await browser(app).get('/api/v1/student/uploads')).status).toBe(401);
    expect(await testDb().studentUpload.count({ where: { studentId: s.studentId } })).toBe(0);
  });

  it('never serves another student’s file', async () => {
    const owner = await activatedStudent(app, registrar, 'UPL');
    const other = await activatedStudent(app, registrar, 'UPL');
    expect(
      (await upload(owner.agent, 'ACADEMIC_MASTERS', staticPdf(), 'application/pdf')).status,
    ).toBe(201);
    expect((await other.agent.get('/api/v1/student/uploads/ACADEMIC_MASTERS/file')).status).toBe(
      404,
    );
    expect(
      studentUploadListSchema.parse(
        (await other.agent.get('/api/v1/student/uploads').expect(200)).body,
      ).data,
    ).toEqual([]);
  });
});

describe('student uploads: staff', () => {
  it('lets REGISTRAR and SUPER_ADMIN list and download (audited); others are refused', async () => {
    const s = await activatedStudent(app, registrar, 'UPL');
    const saved = studentUploadSchema.parse(
      (await upload(s.agent, 'ACADEMIC_CLASS_12', staticPdf(), 'application/pdf')).body,
    );
    for (const reader of [registrar, superAdmin]) {
      const list = await reader.get(`students/${s.studentId}/uploads`).expect(200);
      expect(list.headers['cache-control']).toBe('no-store');
      expect(studentUploadListSchema.parse(list.body).data.map((item) => item.id)).toEqual([
        saved.id,
      ]);
      const file = await reader.get(`students/${s.studentId}/uploads/${saved.id}/file`).expect(200);
      expect(file.headers['cache-control']).toBe('private, no-store');
      expect(file.headers['content-disposition']).toBe(
        'attachment; filename="academic-class-12.pdf"',
      );
    }
    for (const refused of [viewer, examAdmin]) {
      expect((await refused.get(`students/${s.studentId}/uploads`)).status).toBe(403);
      expect((await refused.get(`students/${s.studentId}/uploads/${saved.id}/file`)).status).toBe(
        403,
      );
    }
    // The upload must belong to the student in the path.
    const other = await activatedStudent(app, registrar, 'UPL');
    expect(
      (await registrar.get(`students/${other.studentId}/uploads/${saved.id}/file`)).status,
    ).toBe(404);

    const viewed = await testDb().auditLog.findMany({
      where: { action: 'STUDENT_UPLOADS_VIEWED', entityId: s.studentId },
    });
    expect(viewed.map((entry) => entry.actorUserId).sort()).toEqual(
      [registrar.user.id, superAdmin.user.id].sort(),
    );
    expect(viewed[0]?.metadata).toEqual({ studentId: s.studentId, uploadIds: [saved.id] });
    const downloads = await testDb().auditLog.findMany({
      where: { action: 'STUDENT_UPLOAD_DOWNLOADED', entityId: saved.id },
    });
    expect(downloads).toHaveLength(2);
    expect(downloads[0]?.metadata).toEqual({
      studentId: s.studentId,
      category: 'ACADEMIC_CLASS_12',
      disposition: 'attachment',
    });
  });
});
