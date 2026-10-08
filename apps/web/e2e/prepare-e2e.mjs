// Runs before the e2e API server starts (see playwright.config.ts):
//   1. recreates the disposable `<dev db>_e2e` database from the real migrations;
//   2. creates a SUPER_ADMIN through the same code path as `pnpm admin:create`, with a RANDOM
//      password written to a git-ignored file for the browser test. No credentials are hard-coded.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@docversity/database';
import { prepareTestDatabase } from '@docversity/database/testing';
import { createAdmin } from '../../api/dist/cli/create-admin-core.js';
import { PasswordService } from '../../api/dist/auth/password.service.js';
import { ensureRoles } from '../../api/dist/cli/roles.js';

const baseUrl = process.env.E2E_BASE_DATABASE_URL;
if (!baseUrl) throw new Error('E2E_BASE_DATABASE_URL is required');

const databaseUrl = await prepareTestDatabase({ baseUrl, suffix: '_e2e' });
const credentials = {
  email: `e2e.admin.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Test Admin',
};
const viewer = {
  email: `e2e.viewer.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Test Viewer',
};
let fixture;
const db = createPrismaClient({ connectionString: databaseUrl });
try {
  await createAdmin(db, credentials);

  // A read-only staff member (test fixture, created directly — no admin bootstrap involved).
  await ensureRoles(db);
  const viewerRole = await db.role.findUniqueOrThrow({ where: { name: 'VIEWER' } });
  await db.user.create({
    data: {
      email: viewer.email,
      displayName: viewer.displayName,
      passwordHash: await new PasswordService().hashPassword(viewer.password),
      roles: { create: { roleId: viewerRole.id } },
    },
  });

  // Minimal, clearly labelled academic data so read-only/mobile/a11y tests have something to show.
  const department = await db.department.create({
    data: { code: 'E2E-DEPT', name: 'E2E Fixture Department' },
  });
  const program = await db.program.create({
    data: {
      code: 'E2E-PROG',
      name: 'E2E Fixture Program',
      level: 'UG',
      durationSemesters: 8,
      departmentId: department.id,
    },
  });
  const session = await db.academicSession.create({
    data: { code: 'E2E-SESSION', name: 'E2E Fixture Session', status: 'ACTIVE' },
  });
  const student = await db.student.create({
    data: {
      fullName: 'E2E Fixture Student',
      registrations: {
        create: {
          registrationNumber: 'E2E-REG-0001',
          registrationNumberNormalized: 'E2E-REG-0001',
          programId: program.id,
          departmentId: department.id,
          academicSessionId: session.id,
        },
      },
    },
  });
  fixture = {
    studentId: student.id,
    studentName: student.fullName,
    registrationNumber: 'E2E-REG-0001',
  };
} finally {
  await db.$disconnect();
}

const dir = fileURLToPath(new URL('../.e2e/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}credentials.json`,
  JSON.stringify({ ...credentials, admin: credentials, viewer, fixture }),
  { mode: 0o600 },
);
console.log('e2e database and admin fixture ready');
