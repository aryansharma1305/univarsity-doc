import { readFileSync } from 'node:fs';
import { createPrismaClient } from '/app/packages/database/dist/index.js';
import { createAdmin } from '/app/apps/api/dist/cli/create-admin-core.js';
import { PasswordService } from '/app/apps/api/dist/auth/password.service.js';
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== 'postgres' || url.pathname !== '/docversity_staging')
  throw Error('Not isolated staging');
const db = createPrismaClient({ connectionString: url.toString() });
try {
  if ((await db.student.count()) || (await db.user.count()))
    throw Error('Fixture requires an empty staging database');
  const fixture = JSON.parse(readFileSync('/credentials/fixture.json', 'utf8'));
  await createAdmin(db, {
    email: fixture.email,
    displayName: 'SYNTHETIC Staging Administrator',
    password: fixture.staffPassword,
  });
  const department = await db.department.create({
    data: { code: 'STAGING-DEPT', name: 'SYNTHETIC Staging Department' },
  });
  const program = await db.program.create({
    data: {
      code: 'STAGING-PROG',
      name: 'SYNTHETIC Staging Course',
      level: 'UG',
      durationSemesters: 2,
      departmentId: department.id,
    },
  });
  const session = await db.academicSession.create({
    data: { code: 'STAGING-SESSION', name: 'SYNTHETIC Staging Session', status: 'ACTIVE' },
  });
  await db.student.create({
    data: {
      fullName: 'SYNTHETIC Staging Student',
      registrations: {
        create: {
          registrationNumber: fixture.registrationNumber,
          registrationNumberNormalized: fixture.registrationNumber,
          departmentId: department.id,
          programId: program.id,
          academicSessionId: session.id,
        },
      },
      account: {
        create: { passwordHash: await new PasswordService().hashPassword(fixture.studentPassword) },
      },
    },
  });
  console.log('Created synthetic staging accounts; credentials remain in the local private file.');
} finally {
  await db.$disconnect();
}
