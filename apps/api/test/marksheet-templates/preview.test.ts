import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { marksheetTemplatesResponseSchema } from '@docversity/validation';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activatedStudent } from '../student-auth/support.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/storage.module.js';
import type { ObjectStorage } from '@docversity/storage';
import { AuditService } from '../../src/audit/audit.service.js';
import { MarksheetTemplatesService } from '../../src/marksheet-templates/marksheet-templates.service.js';
let app: INestApplication, admin: Staff, certificate: Staff, viewer: Staff;
const query = 'templateId=sample-academic&version=1&fixture=semester';
beforeAll(async () => {
  app = await createTestApp(realConfig());
  admin = await staff(app, ['SUPER_ADMIN']);
  certificate = await staff(app, ['CERTIFICATE_ADMIN']);
  viewer = await staff(app, ['VIEWER']);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());
it('denies anonymous, unauthorized staff and student sessions with no-store', async () => {
  const anonymous = await browser(app)
    .get(`/api/v1/marksheet-templates/preview?${query}`)
    .expect(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  await viewer.get('marksheet-templates').expect(403);
  await viewer.get(`marksheet-templates/preview?${query}`).expect(403);
  const student = await activatedStudent(app, admin);
  await student.agent.get(`/api/v1/marksheet-templates/preview?${query}`).expect(401);
});
it('uses existing template-authoring permissions, not result-read or publication powers', async () => {
  for (const role of ['REGISTRAR', 'EXAM_ADMIN', 'APPROVER'] as const) {
    const other = await staff(app, [role]);
    await other.get('marksheet-templates').expect(403);
  }
  for (const user of [admin, certificate]) {
    const response = await user.get('marksheet-templates').expect(200);
    expect(marksheetTemplatesResponseSchema.parse(response.body).templates[0]?.status).toBe(
      'PREVIEW_ONLY',
    );
  }
});
it('returns synthetic PDFs with safe headers and audits, without academic queries or storage writes', async () => {
  const prisma = app.get(PrismaService).client;
  const results = vi.spyOn(prisma.result, 'findMany');
  const items = vi.spyOn(prisma.resultItem, 'findMany');
  const registration = vi.spyOn(prisma.studentRegistration, 'findUnique');
  const storage = app.get<ObjectStorage>(OBJECT_STORAGE);
  const put = vi.spyOn(storage, 'putObject');
  const before = await testDb().result.count();
  for (const disposition of ['inline', 'attachment']) {
    for (const fixture of ['semester', 'year', 'stress']) {
      const response = await certificate
        .get(
          `marksheet-templates/preview?templateId=sample-academic&version=1&fixture=${fixture}&disposition=${disposition}`,
        )
        .expect(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        `${disposition}; filename="sample-marksheet-${fixture}-v1.pdf"`,
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    }
  }
  expect(results).not.toHaveBeenCalled();
  expect(items).not.toHaveBeenCalled();
  expect(registration).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(await testDb().result.count()).toBe(before);
  const audits = await testDb().auditLog.findMany({
    where: { actorUserId: certificate.user.id, action: 'MARKSHEET_PREVIEW_GENERATED' },
  });
  expect(audits).toHaveLength(6);
  expect(JSON.stringify(audits.map((a) => a.metadata))).not.toMatch(
    /Alex|SAMPLE\/2026|studentId|resultId/,
  );
});
it('strictly rejects identities, URLs, traversal, unknown versions and attempts to remove watermark', async () => {
  for (const suffix of [
    '&studentId=real',
    '&resultId=real',
    '&watermark=false',
    '&logo=https://example.test',
  ])
    await admin.get(`marksheet-templates/preview?${query}${suffix}`).expect(400);
  await admin
    .get('marksheet-templates/preview?templateId=sample-academic&version=2&fixture=semester')
    .expect(400);
  await admin
    .get('marksheet-templates/preview?templateId=sample-academic&version=1&fixture=../../private')
    .expect(400);
  await admin.get('marksheet-templates?studentId=real').expect(400);
});
it('does not deliver the PDF if the preview audit fails, and allows a subsequent retry', async () => {
  vi.spyOn(app.get(AuditService), 'writeAuditEvent').mockRejectedValueOnce(
    new Error('Synthetic audit failure'),
  );
  const failed = await admin.get(`marksheet-templates/preview?${query}`).expect(500);
  expect(failed.headers['content-type']).not.toContain('application/pdf');
  await admin.get(`marksheet-templates/preview?${query}`).expect(200);
});
it('bounds concurrent rendering and releases capacity after completion', async () => {
  const audit = app.get(AuditService);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(audit, 'writeAuditEvent').mockImplementation(() => gate);
  const service = app.get(MarksheetTemplatesService);
  const input = {
    templateId: 'sample-academic',
    version: 1,
    fixture: 'semester',
    disposition: 'inline',
  } as const;
  const first = service.preview(input, admin.user.id),
    second = service.preview(input, admin.user.id);
  await expect(service.preview(input, admin.user.id)).rejects.toMatchObject({ status: 503 });
  release();
  await Promise.all([first, second]);
  spy.mockRestore();
  await expect(service.preview(input, admin.user.id)).resolves.toBeInstanceOf(Buffer);
});
