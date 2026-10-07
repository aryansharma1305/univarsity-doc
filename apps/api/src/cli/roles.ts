import type { PrismaClient } from '@docversity/database';
import { ROLE_DESCRIPTIONS, ROLE_NAMES } from '@docversity/types';

/**
 * Ensures every code-defined role exists as a database record. Idempotent; never removes roles and
 * never changes assignments.
 */
export async function ensureRoles(db: PrismaClient): Promise<void> {
  // One statement with ON CONFLICT DO NOTHING: safe under concurrent runs.
  await db.role.createMany({
    data: Object.values(ROLE_NAMES).map((name) => ({ name, description: ROLE_DESCRIPTIONS[name] })),
    skipDuplicates: true,
  });
}
