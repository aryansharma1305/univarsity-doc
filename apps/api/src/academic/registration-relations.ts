import type { Prisma } from '@docversity/database';
import { checkRegistrationRelations } from '@docversity/validation';
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

const FIELD_PATHS = {
  program: 'programId',
  academicSession: 'academicSessionId',
  department: 'departmentId',
} as const;

/**
 * Validates and resolves a registration's program / session / department server-side — IDs from
 * the client are never trusted as-is. The rules themselves (`checkRegistrationRelations`) are shared
 * with student imports, so manual entry and Excel imports enforce exactly the same invariants:
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
    select: {
      id: true,
      code: true,
      status: true,
      department: { select: { id: true, code: true, status: true } },
    },
  });
  if (!program) throw invalidRelation('programId', 'Choose an existing program.');
  if (assigning.program && program.status !== 'ACTIVE') {
    throw invalidRelation('programId', 'This program is inactive. Choose an active program.');
  }

  const session = await tx.academicSession.findUnique({
    where: { id: input.academicSessionId },
    select: { id: true, code: true, status: true },
  });
  if (!session) throw invalidRelation('academicSessionId', 'Choose an existing academic session.');

  const department =
    !program.department && input.departmentId
      ? await tx.department.findUnique({
          where: { id: input.departmentId },
          select: { id: true, code: true, status: true },
        })
      : null;

  const result = checkRegistrationRelations(
    { program, session, departmentId: input.departmentId, department },
    assigning,
  );
  if (!result.ok) throw invalidRelation(FIELD_PATHS[result.issue.field], result.issue.message);
  return {
    programId: result.programId,
    academicSessionId: result.academicSessionId,
    departmentId: result.departmentId,
  };
}
