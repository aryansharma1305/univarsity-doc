import { createPrismaClient } from '/app/packages/database/dist/index.js';

// Operator-only and aggregate-only. No student identifiers or credentials are printed.
const client = createPrismaClient({ connectionString: process.env.DATABASE_URL });
try {
  const tables = await client.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  const allowed = new Set(['_prisma_migrations', 'roles', 'user_roles', 'users', 'audit_logs']);
  for (const { tablename } of tables) {
    if (allowed.has(tablename)) continue;
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected schema table');
    const [{ count }] = await client.$queryRawUnsafe(
      `SELECT count(*)::int AS count FROM public."${tablename}"`,
    );
    if (count !== 0)
      throw new Error('Academic/application database is not empty; bootstrap refused.');
  }
  const expectedUsers = process.argv.includes('--after-bootstrap') ? 1 : 0;
  if ((await client.user.count()) !== expectedUsers)
    throw new Error('Unexpected account count; bootstrap refused.');
  if (
    expectedUsers &&
    (await client.user.count({
      where: { status: 'ACTIVE', roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
    })) !== 1
  )
    throw new Error('Expected exactly one active Super Admin.');
  if (
    (await client.userRole.count()) !== expectedUsers ||
    (await client.auditLog.count()) !== expectedUsers ||
    (await client.auditLog.count({ where: { action: { not: 'ADMIN_CREATED' } } })) !== 0
  )
    throw new Error('Unexpected audit history; this is not a clean bootstrap.');
  console.log(
    expectedUsers
      ? 'Clean bootstrap verified: one active Super Admin, no academic/application records.'
      : 'Clean migrated database verified: no users or academic/application records.',
  );
} finally {
  await client.$disconnect();
}
