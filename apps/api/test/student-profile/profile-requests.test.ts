import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from '@docversity/storage';
import { studentMeSchema, studentProfileRequestListSchema } from '@docversity/validation';
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
import { cancelRequest, detailOf, images, submitRequest, studentRequestOf } from './support.js';

let app: INestApplication;
let registrar: Staff;
let registrar2: Staff;
let viewer: Staff;
const storage = new MemoryObjectStorage();

beforeAll(async () => {
  // In-memory storage lets the tests inspect exactly what was stored (and fail it on purpose).
  app = await createTestApp(realConfig(), { objectStorage: storage });
  [registrar, registrar2, viewer] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['REGISTRAR']),
    staff(app, ['VIEWER']),
  ]);
});
afterAll(async () => {
  await app.close();
});

const DOB = '2001-04-05';

async function student(prefix = 'PRQ') {
  return activatedStudent(app, registrar, prefix);
}

async function officialStudent(studentId: string) {
  return testDb().student.findUniqueOrThrow({ where: { id: studentId } });
}

describe('student submission', () => {
  it('submits a missing date of birth for approval without touching the official record', async () => {
    const s = await student();
    const response = await submitRequest(
      s.agent,
      { dateOfBirth: DOB },
      { note: 'From my certificate' },
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const request = studentRequestOf(response.body);
    expect(request.status).toBe('PENDING');
    expect(request.changes).toEqual([{ field: 'dateOfBirth', previous: null, proposed: DOB }]);
    expect(request.photo).toBeNull();
    expect(request.note).toBe('From my certificate');
    expect((await officialStudent(s.studentId)).dateOfBirth).toBeNull();

    const me = studentMeSchema.parse((await s.agent.get('/api/v1/student/me').expect(200)).body);
    expect(me.student.dateOfBirth).toBeNull();
    const list = studentProfileRequestListSchema.parse(
      (await s.agent.get('/api/v1/student/profile-requests').expect(200)).body,
    );
    expect(list.data.map((item) => item.id)).toEqual([request.id]);
  });

  it('stores a photo privately as a re-encoded JPEG without metadata', async () => {
    const s = await student();
    const original = await images.jpeg(2400, 3200);
    const response = await submitRequest(
      s.agent,
      {},
      { photo: { bytes: original, contentType: 'image/jpeg', filename: '../../evil name.jpg' } },
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const request = studentRequestOf(response.body);
    expect(request.photo).toMatchObject({ width: 900, height: 1200 });

    const row = await testDb().studentProfileChangeRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(row.photoStorageKey).toMatch(
      new RegExp(`^students/${s.studentId}/photos/[0-9a-f-]{36}\\.jpg$`),
    );
    const stored = storage.objects.get(row.photoStorageKey ?? '');
    expect(stored?.contentType).toBe('image/jpeg');
    const bytes = Buffer.from(stored?.body ?? new Uint8Array());
    expect(bytes.includes('SYNTHETIC-EXIF-MARKER')).toBe(false);
    expect(bytes.includes('evil name')).toBe(false);
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.exif).toBeUndefined();

    // The student can preview their own staged photo; nothing is public.
    const own = await s.agent
      .get(`/api/v1/student/profile-requests/${request.id}/photo`)
      .expect(200);
    expect(own.headers['content-type']).toBe('image/jpeg');
    expect(own.headers['cache-control']).toBe('no-store');
    expect(
      (await browser(app).get(`/api/v1/student/profile-requests/${request.id}/photo`)).status,
    ).toBe(401);
    // The official photo does not exist until approval.
    expect((await s.agent.get('/api/v1/student/photo')).status).toBe(404);
  });

  it('accepts PNG (flattened to JPEG) together with text corrections', async () => {
    const s = await student();
    const response = await submitRequest(
      s.agent,
      { fullName: 'Corrected Test Name', gender: 'Female', fatherName: "O'Neil Test-Father" },
      { photo: { bytes: await images.png(), contentType: 'image/png', filename: 'p.png' } },
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(studentRequestOf(response.body).changes.map((change) => change.field)).toEqual([
      'fullName',
      'fatherName',
      'gender',
    ]);
  });

  it.each([
    ['a text file claiming to be a JPEG', () => Buffer.from('not an image at all'), 'image/jpeg'],
    ['SVG', images.svg, 'image/svg+xml'],
    ['a GIF', images.gif, 'image/gif'],
    ['GIF content declared as JPEG', images.gif, 'image/jpeg'],
    ['a photo smaller than 200 × 200', () => images.jpeg(150, 150), 'image/jpeg'],
  ])('rejects %s and stores nothing', async (_name, make, contentType) => {
    const s = await student();
    const before = storage.objects.size;
    const response = await submitRequest(
      s.agent,
      {},
      { photo: { bytes: await make(), contentType } },
    );
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('UNSUPPORTED_FILE');
    expect(storage.objects.size).toBe(before);
    expect(
      await testDb().studentProfileChangeRequest.count({ where: { studentId: s.studentId } }),
    ).toBe(0);
  });

  it('rejects photos over 5 MB before processing (413)', async () => {
    const s = await student();
    const response = await submitRequest(
      s.agent,
      {},
      { photo: { bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 1), contentType: 'image/jpeg' } },
    );
    expect(response.status).toBe(413);
    expect(errorOf(response).code).toBe('FILE_TOO_LARGE');
  });

  it('refuses empty, unchanged and disallowed changes with field errors', async () => {
    const s = await student();
    const empty = await submitRequest(s.agent, {});
    expect(empty.status).toBe(400);
    expect(errorOf(empty).code).toBe('PROFILE_REQUEST_NO_CHANGES');

    const unchanged = await submitRequest(s.agent, { fullName: s.me.student.fullName });
    expect(unchanged.status).toBe(400);
    expect(errorOf(unchanged).details?.[0]?.path).toBe('changes.fullName');

    for (const bad of [
      { dateOfBirth: '2099-01-01' },
      { dateOfBirth: 'yesterday' },
      { gender: 'Robot' },
      { fullName: '<script>' },
      { photoStorageKey: 'students/x.jpg' },
    ]) {
      const response = await submitRequest(s.agent, bad);
      expect(response.status, JSON.stringify(bad)).toBe(400);
    }
    // A DOB already on record cannot be "submitted" again (corrections go through the registrar).
    await testDb().student.update({
      where: { id: s.studentId },
      data: { dateOfBirth: new Date('2000-01-01T00:00:00Z') },
    });
    const dob = await submitRequest(s.agent, { dateOfBirth: DOB });
    expect(dob.status).toBe(400);
    expect(errorOf(dob).details?.[0]?.path).toBe('changes.dateOfBirth');
    expect(
      await testDb().studentProfileChangeRequest.count({ where: { studentId: s.studentId } }),
    ).toBe(0);
  });

  it('takes the student from the session only — client-supplied identities are refused', async () => {
    const s = await student();
    const other = await student();
    const response = await submitRequest(
      s.agent,
      { dateOfBirth: DOB },
      { extra: { studentId: other.studentId } },
    );
    expect(response.status).toBe(400);
    expect(
      await testDb().studentProfileChangeRequest.count({ where: { studentId: other.studentId } }),
    ).toBe(0);
    // No CSRF token → refused before anything is read.
    const noCsrf = await s.agent
      .post('/api/v1/student/profile-requests')
      .field('changes', JSON.stringify({ dateOfBirth: DOB }));
    expect(noCsrf.status).toBe(403);
  });
});

describe('ownership and pending rules', () => {
  it('hides other students’ requests and photos (404) and refuses staff sessions on student routes', async () => {
    const owner = await student();
    const intruder = await student();
    const request = studentRequestOf(
      (
        await submitRequest(
          owner.agent,
          { dateOfBirth: DOB },
          { photo: { bytes: await images.jpeg(), contentType: 'image/jpeg' } },
        )
      ).body,
    );
    for (const path of [
      `/api/v1/student/profile-requests/${request.id}`,
      `/api/v1/student/profile-requests/${request.id}/photo`,
    ]) {
      expect((await intruder.agent.get(path)).status).toBe(404);
    }
    expect((await cancelRequest(intruder.agent, request.id)).status).toBe(404);
    const list = studentProfileRequestListSchema.parse(
      (await intruder.agent.get('/api/v1/student/profile-requests').expect(200)).body,
    );
    expect(list.data).toEqual([]);
    expect((await registrar.get('student/profile-requests')).status).toBe(401);
    // …and students cannot reach the staff review API.
    expect((await owner.agent.get('/api/v1/profile-requests')).status).toBe(401);
    expect((await owner.agent.get(`/api/v1/profile-requests/${request.id}`)).status).toBe(401);
    expect(
      (await testDb().studentProfileChangeRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('PENDING');
  });

  it('allows one pending request per student, also under concurrent submissions', async () => {
    const s = await student();
    const first = await submitRequest(s.agent, { dateOfBirth: DOB });
    expect(first.status).toBe(201);
    const second = await submitRequest(s.agent, { gender: 'Male' });
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('PROFILE_REQUEST_PENDING');

    const racer = await student();
    const results = await Promise.all(
      [{ gender: 'Male' }, { gender: 'Female' }, { gender: 'Other' }].map((changes) =>
        submitRequest(racer.agent, changes),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(
      await testDb().studentProfileChangeRequest.count({
        where: { studentId: racer.studentId, status: 'PENDING' },
      }),
    ).toBe(1);
  });

  it('cancels a pending request without changing the record, then accepts a new one', async () => {
    const s = await student();
    const request = studentRequestOf((await submitRequest(s.agent, { dateOfBirth: DOB })).body);
    const cancelled = await cancelRequest(s.agent, request.id);
    expect(cancelled.status).toBe(200);
    expect(studentRequestOf(cancelled.body)).toMatchObject({ status: 'CANCELLED' });
    expect(studentRequestOf(cancelled.body).decidedAt).not.toBeNull();
    expect((await officialStudent(s.studentId)).dateOfBirth).toBeNull();

    const again = await cancelRequest(s.agent, request.id);
    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe('PROFILE_REQUEST_NOT_PENDING');
    expect((await registrar.post(`profile-requests/${request.id}/approve`, {})).status).toBe(409);
    expect((await submitRequest(s.agent, { dateOfBirth: DOB })).status).toBe(201);
  });
});

describe('staff review', () => {
  it('lists and filters requests and compares submitted, proposed and current values', async () => {
    const s = await student('PRQLIST');
    const request = studentRequestOf(
      (
        await submitRequest(
          s.agent,
          { dateOfBirth: DOB, motherName: 'Synthetic Mother' },
          { photo: { bytes: await images.jpeg(), contentType: 'image/jpeg' } },
        )
      ).body,
    );
    const list = await registrar
      .get(
        `profile-requests?status=PENDING&search=${encodeURIComponent(s.registrationNumber.toLowerCase())}`,
      )
      .expect(200);
    const rows = (list.body as { data: { id: string; fields: string[]; hasPhoto: boolean }[] })
      .data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: request.id,
      fields: ['motherName', 'dateOfBirth'],
      hasPhoto: true,
    });

    const detail = detailOf(
      (await registrar.get(`profile-requests/${request.id}`).expect(200)).body,
    );
    expect(detail.changes).toEqual([
      {
        field: 'motherName',
        previous: null,
        proposed: 'Synthetic Mother',
        current: null,
        changedSinceSubmission: false,
      },
      {
        field: 'dateOfBirth',
        previous: null,
        proposed: DOB,
        current: null,
        changedSinceSubmission: false,
      },
    ]);
    expect(detail.stale).toBe(false);
    expect(detail.hasOfficialPhoto).toBe(false);
    expect(detail.registrationNumbers).toEqual([s.registrationNumber]);
    expect(detail.history.map((h) => [h.action, h.actor])).toEqual([
      ['STUDENT_PROFILE_REQUEST_SUBMITTED', 'Student'],
    ]);
    const proposed = await registrar
      .get(`profile-requests/${request.id}/photo?variant=proposed`)
      .expect(200);
    expect(proposed.headers['content-type']).toBe('image/jpeg');
    expect(proposed.headers['cache-control']).toBe('no-store');
    expect(
      (await registrar.get(`profile-requests/${request.id}/photo?variant=official`)).status,
    ).toBe(404);
    expect((await registrar.get(`profile-requests/${request.id}/photo?variant=other`)).status).toBe(
      400,
    );
  });

  it('enforces staff permissions for reading and reviewing', async () => {
    const s = await student();
    const request = studentRequestOf((await submitRequest(s.agent, { dateOfBirth: DOB })).body);
    const examAdmin = await staff(app, ['EXAM_ADMIN']);
    for (const member of [viewer, examAdmin]) {
      expect((await member.get('profile-requests')).status).toBe(403);
      expect((await member.get(`profile-requests/${request.id}`)).status).toBe(403);
      expect(
        (await member.get(`profile-requests/${request.id}/photo?variant=proposed`)).status,
      ).toBe(403);
      expect((await member.post(`profile-requests/${request.id}/approve`, {})).status).toBe(403);
      expect(
        (await member.post(`profile-requests/${request.id}/reject`, { reason: 'Not allowed' }))
          .status,
      ).toBe(403);
    }
    expect((await browser(app).get('/api/v1/profile-requests')).status).toBe(401);
    // CSRF is required for decisions.
    expect(
      (await registrar.agent.post(`/api/v1/profile-requests/${request.id}/approve`).send({}))
        .status,
    ).toBe(403);
    expect((await officialStudent(s.studentId)).dateOfBirth).toBeNull();
  });

  it('approves: updates only the requested fields and the photo, atomically and audited', async () => {
    const s = await student();
    const before = await officialStudent(s.studentId);
    await testDb().student.update({
      where: { id: s.studentId },
      data: { fatherName: 'Untouched Father' },
    });
    const request = studentRequestOf(
      (
        await submitRequest(
          s.agent,
          { dateOfBirth: DOB, gender: 'Female' },
          { photo: { bytes: await images.jpeg(), contentType: 'image/jpeg' } },
        )
      ).body,
    );
    const approved = detailOf(
      (await registrar.post(`profile-requests/${request.id}/approve`, {}).expect(200)).body,
    );
    expect(approved.status).toBe('APPROVED');
    const reviewer = await testDb().user.findUniqueOrThrow({ where: { id: registrar.user.id } });
    expect(approved.reviewer).toEqual({ id: reviewer.id, displayName: reviewer.displayName });

    const after = await officialStudent(s.studentId);
    const row = await testDb().studentProfileChangeRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(after.dateOfBirth?.toISOString().slice(0, 10)).toBe(DOB);
    expect(after.gender).toBe('Female');
    expect(after.photoStorageKey).toBe(row.photoStorageKey);
    expect(after.fullName).toBe(before.fullName);
    expect(after.fatherName).toBe('Untouched Father');

    // The student now sees the official values and photo, and the decision.
    const me = studentMeSchema.parse((await s.agent.get('/api/v1/student/me').expect(200)).body);
    expect(me.student).toMatchObject({ dateOfBirth: DOB, gender: 'Female', hasPhoto: true });
    const official = await s.agent.get('/api/v1/student/photo').expect(200);
    expect(official.headers['content-type']).toBe('image/jpeg');
    const mine = studentRequestOf(
      (await s.agent.get(`/api/v1/student/profile-requests/${request.id}`).expect(200)).body,
    );
    expect(mine.status).toBe('APPROVED');
    expect(JSON.stringify(mine)).not.toContain(reviewer.displayName);
    expect(JSON.stringify(mine)).not.toContain(reviewer.id);

    // Audit: request decision + student update, names of fields only — never values.
    const audit = await testDb().auditLog.findMany({
      where: {
        OR: [
          { entityType: 'StudentProfileChangeRequest', entityId: request.id },
          { entityType: 'Student', entityId: s.studentId, action: 'STUDENT_UPDATED' },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      'STUDENT_PROFILE_REQUEST_SUBMITTED',
      'STUDENT_PROFILE_REQUEST_APPROVED',
      'STUDENT_UPDATED',
    ]);
    expect(audit[1]?.actorUserId).toBe(registrar.user.id);
    expect(audit[2]?.metadata).toMatchObject({
      fields: ['gender', 'dateOfBirth', 'photo'],
      source: 'profileRequest',
      profileRequestId: request.id,
    });
    const logged = JSON.stringify(audit);
    expect(logged).not.toContain(DOB);
    expect(logged).not.toContain('Female');
    expect(logged).not.toContain(row.photoStorageKey ?? 'unreachable');
  });

  it('rejects with a mandatory reason, never touching the official record', async () => {
    const s = await student();
    const request = studentRequestOf(
      (
        await submitRequest(
          s.agent,
          { fullName: 'Rejected Test Name' },
          { photo: { bytes: await images.jpeg(), contentType: 'image/jpeg' } },
        )
      ).body,
    );
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'abc' }]) {
      expect((await registrar.post(`profile-requests/${request.id}/reject`, body)).status).toBe(
        400,
      );
    }
    const reason = 'The name does not match the admission documents.';
    const rejected = detailOf(
      (await registrar.post(`profile-requests/${request.id}/reject`, { reason }).expect(200)).body,
    );
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: reason });
    const after = await officialStudent(s.studentId);
    expect(after.fullName).toBe(s.me.student.fullName);
    expect(after.photoStorageKey).toBeNull();

    const mine = studentRequestOf(
      (await s.agent.get(`/api/v1/student/profile-requests/${request.id}`).expect(200)).body,
    );
    expect(mine).toMatchObject({ status: 'REJECTED', rejectionReason: reason });
    const audit = await testDb().auditLog.findMany({
      where: { entityType: 'StudentProfileChangeRequest', entityId: request.id },
    });
    expect(JSON.stringify(audit)).not.toContain(reason);
    expect((await registrar.post(`profile-requests/${request.id}/approve`, {})).status).toBe(409);
  });

  it('refuses stale requests instead of overwriting newer official data', async () => {
    const s = await student();
    const request = studentRequestOf(
      (await submitRequest(s.agent, { fullName: 'Student Proposed Name' })).body,
    );
    // Staff correct the record through the normal student edit after the request was submitted.
    await registrar
      .patch(`students/${s.studentId}`, { fullName: 'Registrar Corrected Name' })
      .expect(200);

    const detail = detailOf(
      (await registrar.get(`profile-requests/${request.id}`).expect(200)).body,
    );
    expect(detail.stale).toBe(true);
    expect(detail.changes[0]).toMatchObject({
      previous: s.me.student.fullName,
      current: 'Registrar Corrected Name',
      changedSinceSubmission: true,
    });
    const approve = await registrar.post(`profile-requests/${request.id}/approve`, {});
    expect(approve.status).toBe(409);
    expect(errorOf(approve).code).toBe('PROFILE_REQUEST_STALE');
    expect((await officialStudent(s.studentId)).fullName).toBe('Registrar Corrected Name');
    expect(
      (await testDb().studentProfileChangeRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('PENDING');
    // It can still be rejected.
    await registrar
      .post(`profile-requests/${request.id}/reject`, {
        reason: 'Record was corrected; please resubmit.',
      })
      .expect(200);
  });

  it('treats a replaced official photo as stale for a photo request', async () => {
    const first = await student();
    const a = studentRequestOf(
      (
        await submitRequest(
          first.agent,
          {},
          { photo: { bytes: await images.jpeg(), contentType: 'image/jpeg' } },
        )
      ).body,
    );
    await testDb().student.update({
      where: { id: first.studentId },
      data: {
        photoStorageKey: `students/${first.studentId}/photos/00000000-0000-4000-8000-000000000000.jpg`,
      },
    });
    const approve = await registrar.post(`profile-requests/${a.id}/approve`, {});
    expect(approve.status).toBe(409);
    expect(errorOf(approve).details?.map((d) => d.path)).toEqual(['photo']);
  });

  it('lets exactly one of concurrent decisions win', async () => {
    const s = await student();
    const request = studentRequestOf((await submitRequest(s.agent, { dateOfBirth: DOB })).body);
    const results = await Promise.all([
      registrar.post(`profile-requests/${request.id}/approve`, {}),
      registrar2.post(`profile-requests/${request.id}/approve`, {}),
      registrar2.post(`profile-requests/${request.id}/reject`, { reason: 'Concurrent rejection.' }),
      cancelRequest(s.agent, request.id),
    ]);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(3);
    const decided = await testDb().auditLog.count({
      where: {
        entityType: 'StudentProfileChangeRequest',
        entityId: request.id,
        action: { not: 'STUDENT_PROFILE_REQUEST_SUBMITTED' },
      },
    });
    expect(decided).toBe(1);
    const updates = await testDb().auditLog.count({
      where: { entityType: 'Student', entityId: s.studentId, action: 'STUDENT_UPDATED' },
    });
    const row = await testDb().studentProfileChangeRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(updates).toBe(row.status === 'APPROVED' ? 1 : 0);
  });
});

describe('database guards', () => {
  it('keeps submissions immutable, decisions final and history undeletable', async () => {
    const s = await student();
    const request = studentRequestOf((await submitRequest(s.agent, { dateOfBirth: DOB })).body);
    const db = testDb();
    await expect(
      db.studentProfileChangeRequest.update({
        where: { id: request.id },
        data: { proposedChanges: { dateOfBirth: '1990-01-01' } },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.studentProfileChangeRequest.delete({ where: { id: request.id } }),
    ).rejects.toThrow(/cannot be deleted/);
    await expect(
      db.studentProfileChangeRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
      }),
    ).rejects.toThrow();
    await registrar
      .post(`profile-requests/${request.id}/reject`, { reason: 'Final decision.' })
      .expect(200);
    await expect(
      db.studentProfileChangeRequest.update({
        where: { id: request.id },
        data: {
          status: 'PENDING',
          reviewedByUserId: null,
          reviewedAt: null,
          rejectionReason: null,
        },
      }),
    ).rejects.toThrow(/already been decided/);
    const other = await student();
    await expect(
      db.studentProfileChangeRequest.create({
        data: {
          studentId: s.studentId,
          submittedByAccountId: other.me.account.id,
          proposedChanges: { gender: 'Male' },
          currentSnapshot: {},
        },
      }),
    ).rejects.toThrow(/does not belong/);
  });
});

describe('storage failures', () => {
  it('returns 503 and records nothing when the photo cannot be stored', async () => {
    const failing = new MemoryObjectStorage();
    failing.putObject = () => Promise.reject(new Error('simulated outage'));
    failing.getObject = () => Promise.reject(new Error('simulated outage'));
    const outage = await createTestApp(realConfig(), { objectStorage: failing });
    try {
      const registrarOutage = await staff(outage, ['REGISTRAR']);
      const s = await activatedStudent(outage, registrarOutage, 'PRQOUT');
      const response = await submitRequest(
        s.agent,
        { dateOfBirth: DOB },
        { photo: { bytes: await images.jpeg(), contentType: 'image/jpeg' } },
      );
      expect(response.status).toBe(503);
      expect(errorOf(response).code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toContain('simulated outage');
      expect(
        await testDb().studentProfileChangeRequest.count({ where: { studentId: s.studentId } }),
      ).toBe(0);
      // Text-only requests do not need storage.
      const text = await submitRequest(s.agent, { dateOfBirth: DOB });
      expect(text.status).toBe(201);
      const id = studentRequestOf(text.body).id;
      // Reading a photo during an outage is a 503, not a crash.
      await testDb().student.update({
        where: { id: s.studentId },
        data: {
          photoStorageKey: `students/${s.studentId}/photos/00000000-0000-4000-8000-000000000001.jpg`,
        },
      });
      expect((await s.agent.get('/api/v1/student/photo')).status).toBe(503);
      expect(
        (await registrarOutage.get(`profile-requests/${id}/photo?variant=official`)).status,
      ).toBe(503);
    } finally {
      await outage.close();
    }
  });

  it('removes the stored photo when the request cannot be recorded (concurrent submissions)', async () => {
    const s = await student();
    const photo = await images.jpeg();
    // Concurrent submissions pass the early check, upload, then lose on the unique index.
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        submitRequest(s.agent, {}, { photo: { bytes: photo, contentType: 'image/jpeg' } }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const stored = [...storage.objects.keys()].filter((key) =>
      key.startsWith(`students/${s.studentId}/`),
    );
    const row = await testDb().studentProfileChangeRequest.findFirstOrThrow({
      where: { studentId: s.studentId },
    });
    expect(stored).toEqual([row.photoStorageKey]);
  });
});
