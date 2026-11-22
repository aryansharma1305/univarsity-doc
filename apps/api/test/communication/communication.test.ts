import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  messageThreadDetailSchema,
  messageThreadListSchema,
  notificationListSchema,
  publicVerificationQueryReceiptSchema,
  requesterVerificationQueryListSchema,
  requesterVerificationQuerySchema,
  staffVerificationQueryListSchema,
  staffVerificationQuerySchema,
  unreadCountSchema,
} from '@docversity/validation';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { IdentifierHasher } from '../../src/auth/identifier-hasher.js';
import { browser, createTestApp, http, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent, studentCsrf } from '../student-auth/support.js';
import { submitRequest } from '../student-profile/support.js';

let app: INestApplication;
let registrar: Staff;
let viewer: Staff;
let examAdmin: Staff;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  [registrar, viewer, examAdmin] = await Promise.all([
    staff(app, ['REGISTRAR']),
    staff(app, ['VIEWER']),
    staff(app, ['EXAM_ADMIN']),
  ]);
});
afterAll(async () => {
  await app.close();
});

type Agent = ReturnType<typeof browser>;
async function studentPost(agent: Agent, path: string, body: object) {
  const token = await studentCsrf(agent);
  return agent.post(`/api/v1/${path}`).set('X-CSRF-Token', token).send(body);
}
const SECRET_TEXT = 'Synthetic private message body 7731';

describe('student messages', () => {
  it('runs a private conversation with read state, notifications and append-only history', async () => {
    const a = await activatedStudent(app, registrar, 'MSG');
    const b = await activatedStudent(app, registrar, 'MSG');
    const created = await studentPost(a.agent, 'student/messages', {
      subject: 'Transcript question',
      body: SECRET_TEXT,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const thread = messageThreadDetailSchema.parse(created.body);
    expect(thread).toMatchObject({ status: 'OPEN', unread: false });
    expect(thread.messages).toHaveLength(1);

    // Another student, anonymous callers and staff without the permission see nothing.
    expect((await b.agent.get(`/api/v1/student/messages/${thread.id}`)).status).toBe(404);
    expect(
      messageThreadListSchema.parse((await b.agent.get('/api/v1/student/messages')).body).data,
    ).toEqual([]);
    expect((await browser(app).get('/api/v1/student/messages')).status).toBe(401);
    expect((await viewer.get('messages')).status).toBe(403);
    expect((await examAdmin.get(`messages/${thread.id}`)).status).toBe(403);

    // Staff inbox: unread until opened; the registrar was notified.
    const inbox = messageThreadListSchema.parse(
      (await registrar.get('messages?unread=true&sortOrder=desc')).body,
    );
    expect(inbox.data.find((t) => t.id === thread.id)).toMatchObject({
      unread: true,
      student: { id: a.studentId },
    });
    const staffNotes = notificationListSchema.parse(
      (await registrar.get('notifications?unread=true')).body,
    );
    expect(staffNotes.data.some((n) => n.link === `/admin/messages/${thread.id}`)).toBe(true);
    expect(JSON.stringify(staffNotes)).not.toContain(SECRET_TEXT);
    // GET never changes state; reading is an explicit POST.
    expect(
      messageThreadDetailSchema.parse(
        (await registrar.get(`messages/${thread.id}`).expect(200)).body,
      ).unread,
    ).toBe(true);
    const opened = messageThreadDetailSchema.parse(
      (await registrar.post(`messages/${thread.id}/read`).expect(200)).body,
    );
    expect(opened.unread).toBe(false);
    expect(
      messageThreadListSchema
        .parse((await registrar.get('messages?unread=true&pageSize=100')).body)
        .data.some((t) => t.id === thread.id),
    ).toBe(false);
    expect(opened.messages[0]?.body).toBe(SECRET_TEXT);

    // Staff reply: the student is notified and sees the institution, not the staff name.
    const replied = messageThreadDetailSchema.parse(
      (
        await registrar
          .post(`messages/${thread.id}/replies`, { body: 'Please see the registry.' })
          .expect(201)
      ).body,
    );
    expect(replied.messages).toHaveLength(2);
    const studentView = messageThreadListSchema.parse(
      (await a.agent.get('/api/v1/student/messages')).body,
    );
    expect(studentView.data[0]).toMatchObject({ id: thread.id, unread: true });
    const own = messageThreadDetailSchema.parse(
      (await a.agent.get(`/api/v1/student/messages/${thread.id}`)).body,
    );
    expect(own.messages[1]).toMatchObject({
      author: 'STAFF',
      authorName: 'University administration',
    });
    const notes = notificationListSchema.parse(
      (await a.agent.get('/api/v1/student/notifications')).body,
    );
    expect(notes.data[0]).toMatchObject({
      type: 'MESSAGE_REPLY',
      link: `/student/messages/${thread.id}`,
      readAt: null,
    });

    // A second student message before staff read it: one unread notification, and no resolve
    // over an unseen message until staff have read it.
    await studentPost(a.agent, `student/messages/${thread.id}/replies`, { body: 'Follow-up 1' });
    await studentPost(a.agent, `student/messages/${thread.id}/replies`, { body: 'Follow-up 2' });
    const pile = await testDb().notification.count({
      where: { userId: registrar.user.id, link: `/admin/messages/${thread.id}`, readAt: null },
    });
    expect(pile).toBe(1);
    expect((await registrar.post(`messages/${thread.id}/resolve`)).status).toBe(409);
    await registrar.post(`messages/${thread.id}/read`).expect(200);
    // Resolve → staff cannot reply until reopened; a student reply reopens it.
    await registrar.post(`messages/${thread.id}/resolve`).expect(200);
    expect((await registrar.post(`messages/${thread.id}/replies`, { body: 'x' })).status).toBe(409);
    expect((await viewer.post(`messages/${thread.id}/reopen`)).status).toBe(403);
    const reopened = messageThreadDetailSchema.parse(
      (
        await studentPost(a.agent, `student/messages/${thread.id}/replies`, {
          body: 'One more thing',
        })
      ).body,
    );
    expect(reopened.status).toBe('OPEN');

    // History is append-only in the database; audits hold IDs, never message text.
    await expect(
      testDb().threadMessage.updateMany({
        where: { threadId: thread.id },
        data: { body: 'edited' },
      }),
    ).rejects.toThrow();
    const audits = await testDb().auditLog.findMany({ where: { entityId: thread.id } });
    expect(audits.map((x) => x.action)).toEqual(
      expect.arrayContaining(['MESSAGE_THREAD_CREATED', 'MESSAGE_SENT', 'MESSAGE_THREAD_RESOLVED']),
    );
    expect(JSON.stringify(audits)).not.toContain(SECRET_TEXT);
  });

  it('validates input and requires CSRF', async () => {
    const s = await activatedStudent(app, registrar, 'MSG');
    expect(
      (await studentPost(s.agent, 'student/messages', { subject: ' ', body: 'x' })).status,
    ).toBe(400);
    expect(
      (await studentPost(s.agent, 'student/messages', { subject: 'S', body: 'x'.repeat(4001) }))
        .status,
    ).toBe(400);
    expect(
      (
        await studentPost(s.agent, 'student/messages', {
          subject: 'S',
          body: 'x',
          studentId: s.studentId,
        })
      ).status,
    ).toBe(400);
    expect(
      (await s.agent.post('/api/v1/student/messages').send({ subject: 'S', body: 'x' })).status,
    ).toBe(403);
  });
});

describe('notifications', () => {
  it('lets each recipient read and mark only their own notifications', async () => {
    const a = await activatedStudent(app, registrar, 'NTF');
    const b = await activatedStudent(app, registrar, 'NTF');
    // A profile decision notifies the student.
    const request = await submitRequest(a.agent, { fullName: 'Synthetic Renamed Student' });
    expect(request.status, JSON.stringify(request.body)).toBe(201);
    const id = (request.body as { id: string }).id;
    await registrar
      .post(`profile-requests/${id}/reject`, { reason: 'Synthetic reason' })
      .expect(200);
    const list = notificationListSchema.parse(
      (await a.agent.get('/api/v1/student/notifications')).body,
    );
    const note = list.data.find((n) => n.type === 'PROFILE_REQUEST_REJECTED');
    expect(note).toMatchObject({ link: '/student/profile/requests', readAt: null });
    expect(JSON.stringify(list)).not.toContain('Synthetic reason');
    expect(
      unreadCountSchema.parse(
        (await a.agent.get('/api/v1/student/notifications/unread-count')).body,
      ).unread,
    ).toBeGreaterThan(0);

    // Another student cannot mark it; the owner can, once.
    expect(
      (await studentPost(b.agent, `student/notifications/${note?.id ?? ''}/read`, {})).status,
    ).toBe(404);
    expect((await registrar.post(`notifications/${note?.id ?? ''}/read`)).status).toBe(404);
    const read = await studentPost(a.agent, `student/notifications/${note?.id ?? ''}/read`, {});
    expect(read.status).toBe(200);
    expect((read.body as { readAt: string | null }).readAt).not.toBeNull();
    await studentPost(a.agent, 'student/notifications/read-all', {});
    expect(
      unreadCountSchema.parse(
        (await a.agent.get('/api/v1/student/notifications/unread-count')).body,
      ).unread,
    ).toBe(0);
    // Idempotent per event and recipient.
    const rows = await testDb().notification.count({
      where: { studentId: a.studentId, type: 'PROFILE_REQUEST_REJECTED' },
    });
    expect(rows).toBe(1);
  });
});

describe('verification queries', () => {
  async function clearPublicBudgets() {
    const limiter = app.get(RateLimiter);
    const hash = app.get(IdentifierHasher);
    for (const scope of ['verification-query-public', 'verification-query-status'])
      for (const ip of ['::ffff:127.0.0.1', '127.0.0.1'])
        await limiter.clear(scope, [hash.hash(scope, ip)]);
  }

  it('handles a student query end to end with versioned answers and a notification', async () => {
    const s = await activatedStudent(app, registrar, 'VQS');
    const submitted = await studentPost(s.agent, 'student/verification-queries', {
      category: 'RECORD_NOT_FOUND',
      documentReference: 'SYN-CERT-1',
      message: 'My certificate is not found.',
    });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    const q = requesterVerificationQuerySchema.parse(submitted.body);
    expect(q.reference).toMatch(/^VQ-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect((await viewer.get('verification-queries')).status).toBe(403);
    const listed = staffVerificationQueryListSchema.parse(
      (await registrar.get(`verification-queries?search=${q.reference}`)).body,
    );
    expect(listed.data[0]).toMatchObject({
      id: q.id,
      source: 'STUDENT',
      student: { id: s.studentId },
    });
    expect(
      (
        await registrar.post(`verification-queries/${q.id}/respond`, {
          response: 'Answer',
          version: 9,
        })
      ).status,
    ).toBe(409);
    const answered = staffVerificationQuerySchema.parse(
      (
        await registrar
          .post(`verification-queries/${q.id}/respond`, {
            response: 'Please re-check the number.',
            version: 1,
          })
          .expect(200)
      ).body,
    );
    expect(answered).toMatchObject({ status: 'ANSWERED', version: 2 });
    const own = requesterVerificationQueryListSchema.parse(
      (await s.agent.get('/api/v1/student/verification-queries')).body,
    );
    expect(own.data[0]).toMatchObject({
      status: 'ANSWERED',
      response: 'Please re-check the number.',
    });
    expect(JSON.stringify(own)).not.toMatch(/requesterName|contactEmail|version/);
    const notes = notificationListSchema.parse(
      (await s.agent.get('/api/v1/student/notifications')).body,
    );
    expect(notes.data.some((n) => n.type === 'VERIFICATION_QUERY_ANSWERED')).toBe(true);
    await registrar.post(`verification-queries/${q.id}/resolve`, { version: 2 }).expect(200);
    expect(
      (
        await registrar.post(`verification-queries/${q.id}/respond`, {
          response: 'Late',
          version: 3,
        })
      ).status,
    ).toBe(409);
  });

  it('lets a public requester check only with the reference and one-time access code', async () => {
    await clearPublicBudgets();
    const agent = browser(app);
    const token = await studentCsrf(agent);
    const submitted = await agent
      .post('/api/v1/public/verification-queries')
      .set('X-CSRF-Token', token)
      .send({
        requesterName: 'Synthetic Employer',
        organization: 'Synthetic Co',
        category: 'HOW_TO_VERIFY',
        message: 'How do we verify a transcript?',
      });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    const receipt = publicVerificationQueryReceiptSchema.parse(submitted.body);
    const row = await testDb().verificationQuery.findUniqueOrThrow({
      where: { reference: receipt.reference },
    });
    expect(row.accessCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.accessCodeHash).not.toContain(receipt.accessCode.toLowerCase());
    // No CSRF token: refused.
    expect(
      (
        await http(app)
          .post('/api/v1/public/verification-queries')
          .send({ requesterName: 'X', category: 'OTHER', message: 'm' })
      ).status,
    ).toBe(403);

    const status = async (reference: string, accessCode: string) =>
      agent
        .post('/api/v1/public/verification-queries/status')
        .set('X-CSRF-Token', token)
        .send({ reference, accessCode });
    const ok = await status(receipt.reference, receipt.accessCode.toLowerCase());
    expect(ok.status).toBe(200);
    expect(requesterVerificationQuerySchema.parse(ok.body)).toMatchObject({
      status: 'OPEN',
      response: null,
    });
    const wrong = await status(receipt.reference, 'WRONGCODE');
    const unknown = await status('VQ-00000000', receipt.accessCode);
    expect(wrong.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect((wrong.body as { error: { message: string } }).error.message).toBe(
      (unknown.body as { error: { message: string } }).error.message,
    );
    expect(JSON.stringify(wrong.body)).not.toContain('Synthetic Employer');
  });

  it('rate-limits public submissions per client', async () => {
    await clearPublicBudgets();
    const agent = browser(app);
    const token = await studentCsrf(agent);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await agent
            .post('/api/v1/public/verification-queries')
            .set('X-CSRF-Token', token)
            .send({
              requesterName: 'Synthetic Bulk',
              category: 'OTHER',
              message: `Query ${String(i)}`,
            })
        ).status,
      );
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
    await clearPublicBudgets();
  });
});
