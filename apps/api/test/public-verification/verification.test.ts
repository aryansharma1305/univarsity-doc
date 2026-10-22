import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  publicVerificationServices,
  unavailableVerificationResponseSchema,
} from '@docversity/validation';
import { createTestApp, realConfig, http, errorOf, staff, testDb } from '../helpers.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import type { ObjectStorage } from '@docversity/storage';
import { newRegistration, activatedStudent } from '../student-auth/support.js';
let app: INestApplication;
const logs: string[] = [];
const path = (service: string) => `/api/v1/public/verify/${service}`;
const input = { contractVersion: 1, reference: 'SYNTHETIC-REFERENCE-13A' };
beforeEach(async () => {
  logs.length = 0;
  app = await createTestApp(realConfig(), { logSink: (line) => logs.push(line) });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

it.each(publicVerificationServices)(
  '%s is anonymous, fail-closed, no-store and strictly bounded',
  async (service) => {
    const response = await http(app).post(path(service)).send(input).expect(200);
    expect(unavailableVerificationResponseSchema.parse(response.body)).toMatchObject({
      service,
      status: 'UNAVAILABLE',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    for (const body of [
      { ...input, contractVersion: 2 },
      { ...input, reference: 'https://evil.invalid/private' },
      { ...input, reference: 'x'.repeat(129) },
      { ...input, reference: ['SYN'] },
      { ...input, studentId: 'secret' },
      { ...input, reference: '' },
    ]) {
      const invalid = await http(app).post(path(service)).send(body).expect(400);
      expect(errorOf(invalid).code).toBe('VALIDATION_FAILED');
    }
    await http(app)
      .post(`${path(service)}?reference=private`)
      .send(input)
      .expect(400);
    await http(app).get(path(service)).expect(404);
  },
);

it('never queries academic records or storage, even for an existing registration', async () => {
  const registration = await newRegistration('PUBLIC13A');
  const db = app.get(PrismaService).client;
  const calls = [
    vi.spyOn(db.studentRegistration, 'findUnique'),
    vi.spyOn(db.studentRegistration, 'findFirst'),
    vi.spyOn(db.studentRegistration, 'findMany'),
    vi.spyOn(db.result, 'findMany'),
    vi.spyOn(db.certificate, 'findUnique'),
    vi.spyOn(db.certificate, 'findMany'),
    vi.spyOn(db.historicalDocument, 'findMany'),
    vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'getObject'),
  ];
  for (const service of publicVerificationServices) {
    const existing = await http(app)
      .post(path(service))
      .send({ ...input, reference: registration.registrationNumber })
      .expect(200);
    const absent = await http(app)
      .post(path(service))
      .send({ ...input, reference: 'DOES-NOT-EXIST-13A' })
      .expect(200);
    expect(existing.body).toEqual(absent.body);
    expect(JSON.stringify(existing.body)).not.toMatch(
      /studentId|registrationNumber|storage|grade|fullName|certificateId/,
    );
  }
  for (const call of calls) expect(call).not.toHaveBeenCalled();
});

it('audits only keyed hashes and contract metadata, never raw input or IP', async () => {
  const audit = vi.spyOn(app.get(AuditService), 'writeAuditEvent');
  await http(app).post(path('registration')).send(input).expect(200);
  await http(app)
    .post(path('registration'))
    .send({ ...input, reference: `  ${input.reference.toLowerCase()}  ` })
    .expect(200);
  expect(audit.mock.calls[0]?.[0].metadata?.referenceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(audit.mock.calls[0]?.[0].metadata?.referenceHash).toBe(
    audit.mock.calls[1]?.[0].metadata?.referenceHash,
  );
  const records = await testDb().auditLog.findMany({
    where: {
      action: 'PUBLIC_VERIFICATION_UNAVAILABLE',
      metadata: {
        path: ['referenceHash'],
        equals: String(audit.mock.calls[0]?.[0].metadata?.referenceHash),
      },
    },
  });
  expect(records.length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(records)).not.toContain(input.reference);
  expect(JSON.stringify(records)).not.toContain('127.0.0.1');
  expect(logs.join('\n')).not.toContain(input.reference);
  const maliciousKey = 'PRIVATE-KEY-13A';
  const invalid = await http(app)
    .post(path('registration'))
    .send({ ...input, [maliciousKey]: 'private' })
    .expect(400);
  expect(JSON.stringify(invalid.body)).not.toContain(maliciousKey);
});

it('counts invalid bodies, aggregates all four services, ignores spoofed forwarding and limits before audit', async () => {
  const audit = vi.spyOn(app.get(AuditService), 'writeAuditEvent');
  for (let i = 0; i < 20; i++)
    await http(app)
      .post(path(publicVerificationServices[i % 4] ?? 'result'))
      .set('X-Forwarded-For', `192.0.2.${i}`)
      .send({})
      .expect(400);
  const limited = await http(app).post(path('certificate')).send(input).expect(429);
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  expect(errorOf(limited).code).toBe('PUBLIC_VERIFICATION_RATE_LIMITED');
  expect(limited.headers['cache-control']).toBe('no-store');
  expect(audit).not.toHaveBeenCalled();
});

it('fails closed on Redis and audit failures without leaking internal errors', async () => {
  const limiter = vi
    .spyOn(app.get(RateLimiter), 'hit')
    .mockRejectedValueOnce(new Error('PRIVATE-REDIS-FAILURE'));
  const redis = await http(app).post(path('result')).send(input).expect(503);
  expect(errorOf(redis).code).toBe('PUBLIC_VERIFICATION_UNAVAILABLE');
  limiter.mockRestore();
  vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValue(
    new Error('PRIVATE-DATABASE-FAILURE'),
  );
  const audit = await http(app).post(path('certificate')).send(input).expect(503);
  expect(JSON.stringify([redis.body, audit.body])).not.toMatch(/PRIVATE|stack|DATABASE/);
});

it('retains origin/CORS controls, rejects form posts and exposes no search/list endpoint', async () => {
  const foreign = await http(app)
    .post(path('result'))
    .set('Origin', 'https://evil.invalid')
    .send(input)
    .expect(403);
  expect(foreign.headers['access-control-allow-origin']).not.toBe('https://evil.invalid');
  await http(app).post(path('result')).type('form').send(input).expect(400);
  for (const suffix of ['', '/search', '/qr', '/certificate/private'])
    await http(app).get(`/api/v1/public/verify${suffix}`).expect(404);
  const allowed = await http(app)
    .post(path('result'))
    .set('Origin', 'http://localhost:3000')
    .send(input)
    .expect(200);
  expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
});

it('cannot gain staff or student powers through a public check or session cookies', async () => {
  const admin = await staff(app, ['SUPER_ADMIN']);
  const student = await activatedStudent(app, admin, 'PUB13');
  await admin.agent.post(path('result')).send(input).expect(200);
  await student.agent.post(path('certificate')).send(input).expect(200);
  await http(app).get('/api/v1/student/me').expect(401);
  await http(app).get('/api/v1/auth/me').expect(401);
  await student.agent.get('/api/v1/students').expect(401);
  await admin.agent.get('/api/v1/student/me').expect(401);
});

it('fails closed when Redis EXEC resolves with a command error instead of rejecting', async () => {
  const redis = app.get(RedisService).client;
  const transaction = redis.multi();
  vi.spyOn(transaction, 'exec').mockResolvedValueOnce([[new Error('PRIVATE-ACL-FAILURE'), null]]);
  vi.spyOn(redis, 'multi').mockReturnValueOnce(transaction);
  const response = await http(app).post(path('result')).send(input).expect(503);
  expect(errorOf(response).code).toBe('PUBLIC_VERIFICATION_UNAVAILABLE');
  expect(JSON.stringify(response.body)).not.toContain('PRIVATE-ACL-FAILURE');
});

it('keeps every service unavailable under production configuration without a test bypass', async () => {
  const production = await createTestApp(
    realConfig({
      NODE_ENV: 'production',
      COOKIE_SECURE: true,
      SESSION_SECRET: 'synthetic-production-test-secret-never-used-outside-tests-13a',
      SWAGGER_ENABLED: false,
    }),
  );
  try {
    for (const service of publicVerificationServices) {
      const response = await http(production).post(path(service)).send(input).expect(200);
      expect(unavailableVerificationResponseSchema.parse(response.body)).toMatchObject({
        service,
        status: 'UNAVAILABLE',
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  } finally {
    await production.close();
  }
});
