import type { Prisma } from '@docversity/database';
import { invalidRelation } from '../common/conflicts.js';

export interface RelationInput {
  programId: string;
  academicSessionId: string;
  /** undefined = derive from the program; null = explicitly none. */
  departmentId: string | null | undefined;
}

export interface ResolvedRelations {
  programId: string;
  academicSessionId: string;
  departmentId: string | null;
}

/**
 * Validates and resolves a registration's program / session / department server-side — IDs from
 * the client are never trusted as-is:
 * - the program must exist and be ACTIVE (when it is being assigned);
 * - the session must exist and not be ARCHIVED (when it is being assigned);
 * - if the program belongs to a department, the registration's department must be that department
 *   (it is filled in automatically when omitted); otherwise any ACTIVE department (or none) is allowed.
 */
export async function resolveRegistrationRelations(
  tx: Prisma.TransactionClient,
  input: RelationInput,
  assigning: { program: boolean; session: boolean; department: boolean },
): Promise<ResolvedRelations> {
  const program = await tx.program.findUnique({
    where: { id: input.programId },
    include: { department: true },
  });
  if (!program) throw invalidRelation('programId', 'Choose an existing program.');
  if (assigning.program && program.status !== 'ACTIVE') {
    throw invalidRelation('programId', 'This program is inactive. Choose an active program.');
  }

  const session = await tx.academicSession.findUnique({ where: { id: input.academicSessionId } });
  if (!session) throw invalidRelation('academicSessionId', 'Choose an existing academic session.');
  if (assigning.session && session.status === 'ARCHIVED') {
    throw invalidRelation(
      'academicSessionId',
      'This academic session is archived. Choose another session.',
    );
  }

  let departmentId: string | null;
  if (program.department) {
    if (input.departmentId && input.departmentId !== program.department.id) {
      throw invalidRelation(
        'departmentId',
        `Program ${program.code} belongs to department ${program.department.code}. Choose that department or leave it empty.`,
      );
    }
    departmentId = program.department.id;
  } else if (input.departmentId) {
    const department = await tx.department.findUnique({ where: { id: input.departmentId } });
    if (!department) throw invalidRelation('departmentId', 'Choose an existing department.');
    if (assigning.department && department.status !== 'ACTIVE') {
      throw invalidRelation(
        'departmentId',
        'This department is inactive. Choose an active department.',
      );
    }
    departmentId = department.id;
  } else {
    departmentId = null;
  }

  return { programId: program.id, academicSessionId: session.id, departmentId };
}
