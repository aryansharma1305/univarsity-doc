import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TRAINING_SAMPLE_SHA256 } from '@docversity/documents';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent } from '../student-auth/support.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import type { ObjectStorage } from '@docversity/storage';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { Errors } from '../../src/common/app-error.js';
let app: INestApplication, admin: Staff, student: Awaited<ReturnType<typeof activatedStudent>>;
const path = '/api/v1/student/certificate-samples/sample-training-v1/file';
beforeAll(async () => {
  app = await createTestApp(realConfig());
  admin = await staff(app, ['SUPER_ADMIN']);
  student = await activatedStudent(app, admin);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());
it('requires a student session and retains staff-only authoring permissions, even for staff administrators', async () => {
  for (const agent of [browser(app), admin.agent]) {
    const response = await agent.get(path).expect(401);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  await student.agent.get('/api/v1/certificate-templates').expect(401);
  await student.agent
    .get(
      '/api/v1/certificate-templates/preview?templateId=sample-training&version=1&fixture=standard',
    )
    .expect(401);
});
it('returns the identical approved bytes for different students and both dispositions, with secure headers', async () => {
  const other = await activatedStudent(app, admin);
  for (const agent of [student.agent, other.agent])
    for (const disposition of ['inline', 'attachment']) {
      const response = await agent.get(`${path}?disposition=${disposition}`).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBe(
        "default-src 'none'; frame-ancestors 'self'",
      );
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        `${disposition}; filename="sample-training-certificate-v1.pdf"`,
      );
      const bytes: unknown = response.body;
      if (!Buffer.isBuffer(bytes)) throw new Error('Expected binary sample PDF response');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(TRAINING_SAMPLE_SHA256);
    }
});
it('rejects all non-allowlisted identifiers and arbitrary identity/HTML/URL inputs', async () => {
  for (const id of ['transcript', 'sample-training-v2', 'real-student-id'])
    await student.agent.get(path.replace('sample-training-v1', id)).expect(400);
  for (const query of [
    'studentId=real',
    'url=https://example.com',
    'html=evil',
    'watermark=false',
    'disposition=invalid',
  ])
    await student.agent.get(`${path}?${query}`).expect(400);
});
it('does not access academic data, create certificates or write object storage', async () => {
  const db = app.get(PrismaService).client;
  const reads = [
    vi.spyOn(db.result, 'findMany'),
    vi.spyOn(db.resultItem, 'findMany'),
    vi.spyOn(db.studentRegistration, 'findUnique'),
    vi.spyOn(db.historicalDocument, 'findMany'),
  ];
  const put = vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'putObject');
  const before = [
    await testDb().historicalDocument.count(),
    await testDb().certificateRequest.count(),
  ];
  await student.agent.get(path).expect(200);
  for (const spy of reads) expect(spy).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect([
    await testDb().historicalDocument.count(),
    await testDb().certificateRequest.count(),
  ]).toEqual(before);
});
it('shares a real per-account rate limit across preview/download and fails closed when unavailable', async () => {
  const limited = await activatedStudent(app, admin);
  for (let i = 0; i < 30; i++)
    await limited.agent.get(`${path}?disposition=${i % 2 ? 'inline' : 'attachment'}`).expect(200);
  const response = await limited.agent.get(path).expect(429);
  expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  expect(response.headers['cache-control']).toBe('no-store');
  await student.agent.get(path).expect(200);
  vi.spyOn(app.get(RateLimiter), 'hit').mockRejectedValueOnce(Errors.authUnavailable());
  const failed = await student.agent.get(path).expect(503);
  expect(failed.headers['content-type']).not.toContain('application/pdf');
});
