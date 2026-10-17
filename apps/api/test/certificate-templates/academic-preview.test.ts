import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { academicCertificateTemplatesResponseSchema } from '@docversity/validation';
import type { ObjectStorage } from '@docversity/storage';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent } from '../student-auth/support.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';

let app: INestApplication, admin: Staff, certificate: Staff, viewer: Staff;
const TYPES = ['COURSE_COMPLETION', 'TRANSCRIPT', 'PROVISIONAL', 'CHARACTER', 'MIGRATION'] as const;
const query = (type: string, extra = '') =>
  `certificate-templates/academic/preview?type=${type}&version=1&fixture=standard${extra}`;

beforeAll(async () => {
  app = await createTestApp(realConfig());
  admin = await staff(app, ['SUPER_ADMIN']);
  certificate = await staff(app, ['CERTIFICATE_ADMIN']);
  viewer = await staff(app, ['VIEWER']);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

it('lists five preview-only academic templates separately from the training template', async () => {
  const body = academicCertificateTemplatesResponseSchema.parse(
    (await certificate.get('certificate-templates/academic').expect(200)).body,
  );
  expect(body.templates.map((t) => t.type)).toEqual([...TYPES]);
  expect(new Set(body.templates.map((t) => t.status))).toEqual(new Set(['PREVIEW_ONLY']));
  const training = await certificate.get('certificate-templates').expect(200);
  expect(JSON.stringify(training.body)).not.toMatch(/COURSE_COMPLETION|sample-transcript/);
});

it('uses template-authoring permission only and denies students and anonymous users', async () => {
  await viewer.get('certificate-templates/academic').expect(403);
  await viewer.get(query('MIGRATION')).expect(403);
  for (const role of ['REGISTRAR', 'EXAM_ADMIN', 'APPROVER'] as const)
    await (await staff(app, [role])).get(query('TRANSCRIPT')).expect(403);
  const anonymous = await browser(app)
    .get(`/api/v1/${query('CHARACTER')}`)
    .expect(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  const student = await activatedStudent(app, admin, 'ACAD-PREVIEW');
  await student.agent.get(`/api/v1/${query('CHARACTER')}`).expect(401);
});

it('renders each type from fixed synthetic data with safe headers and an ID-only audit', async () => {
  const prisma = app.get(PrismaService).client;
  const registration = vi.spyOn(prisma.studentRegistration, 'findMany');
  const results = vi.spyOn(prisma.result, 'findMany');
  const put = vi.spyOn(app.get<ObjectStorage>(OBJECT_STORAGE), 'putObject');
  const certificates = await testDb().certificate.count();
  for (const type of TYPES) {
    const r = await certificate.get(query(type, '&disposition=attachment')).expect(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-disposition']).toMatch(
      /^attachment; filename="sample-[a-z-]+-standard-v1\.pdf"$/,
    );
  }
  expect(registration).not.toHaveBeenCalled();
  expect(results).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(await testDb().certificate.count()).toBe(certificates);
  const audits = await testDb().auditLog.findMany({
    where: { actorUserId: certificate.user.id, action: 'ACADEMIC_CERTIFICATE_PREVIEW_GENERATED' },
  });
  expect(
    audits.map((a) => (a.metadata as { certificateType: string }).certificateType).sort(),
  ).toEqual([...TYPES].sort());
  expect(JSON.stringify(audits.map((a) => a.metadata))).not.toMatch(/Alex|SAMPLE-REG|studentId/);
});

it('rejects training aliases, unknown versions, identities and attempts to remove the watermark', async () => {
  for (const q of [
    'certificate-templates/academic/preview?type=TRAINING_CERTIFICATE&version=1&fixture=standard',
    'certificate-templates/academic/preview?type=MIGRATION&version=2&fixture=standard',
    'certificate-templates/academic/preview?type=MIGRATION&version=1&fixture=real',
    query('MIGRATION', '&studentId=00000000-0000-0000-0000-000000000000'),
    query('MIGRATION', '&registrationId=abc'),
    query('MIGRATION', '&watermark=false'),
    query('MIGRATION', '&verificationUrl=https://example.com'),
  ])
    await certificate.get(q).expect(400);
});

it('renders the multipage stress transcripts and refuses stress samples for other types', async () => {
  for (const fixture of ['stress-semester', 'stress-year']) {
    const r = await certificate
      .get(`certificate-templates/academic/preview?type=TRANSCRIPT&version=1&fixture=${fixture}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          chunks.push(c);
        });
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(r.headers['content-disposition']).toBe(
      `inline; filename="sample-transcript-${fixture}-v1.pdf"`,
    );
    const pages = (
      Buffer.from(r.body as Buffer)
        .toString('latin1')
        .match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []
    ).length;
    expect(pages).toBeGreaterThanOrEqual(3);
  }
  const audits = await testDb().auditLog.findMany({
    where: { actorUserId: certificate.user.id, action: 'ACADEMIC_CERTIFICATE_PREVIEW_GENERATED' },
  });
  const stress = audits
    .map((a) => a.metadata as { fixture: string; layout: string; pages: number })
    .filter((m) => m.fixture.startsWith('stress'));
  expect(stress).toHaveLength(2);
  for (const m of stress) {
    expect(m.layout).toBe('MULTIPAGE');
    expect(m.pages).toBeGreaterThanOrEqual(3);
  }
  for (const type of ['MIGRATION', 'COURSE_COMPLETION'])
    await certificate
      .get(`certificate-templates/academic/preview?type=${type}&version=1&fixture=stress-year`)
      .expect(400);
  const listed = academicCertificateTemplatesResponseSchema.parse(
    (await certificate.get('certificate-templates/academic').expect(200)).body,
  );
  expect(
    listed.fixtures
      .filter((f) => f.id.startsWith('stress'))
      .every((f) => f.certificateTypes.join() === 'TRANSCRIPT'),
  ).toBe(true);
});
