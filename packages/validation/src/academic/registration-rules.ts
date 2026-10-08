import type { AcademicSessionStatus, MasterDataStatus } from './common.js';

/**
 * The registration relation rules, shared by manual registration create/update (API) and student
 * imports (worker) so both ingestion paths enforce exactly the same domain rules.
 *
 * Callers load the records (by id in the API, by code in imports) and handle "not found" with
 * their own wording; this function decides everything else.
 */
export interface RuleDepartment {
  id: string;
  code: string;
  status: MasterDataStatus;
}

export interface RuleProgram {
  id: string;
  code: string;
  status: MasterDataStatus;
  department: RuleDepartment | null;
}

export interface RuleSession {
  id: string;
  code: string;
  status: AcademicSessionStatus;
}

export type RegistrationRelationIssueCode =
  | 'INACTIVE_PROGRAM'
  | 'ARCHIVED_SESSION'
  | 'PROGRAM_DEPARTMENT_MISMATCH'
  | 'UNKNOWN_DEPARTMENT'
  | 'INACTIVE_DEPARTMENT';

export interface RegistrationRelationIssue {
  field: 'program' | 'academicSession' | 'department';
  code: RegistrationRelationIssueCode;
  message: string;
}

export type RegistrationRelationResult =
  | { ok: true; programId: string; academicSessionId: string; departmentId: string | null }
  | { ok: false; issue: RegistrationRelationIssue };

export interface RegistrationRelationInput {
  program: RuleProgram;
  session: RuleSession;
  /** undefined = derive from the program; null = explicitly none; otherwise the requested id. */
  departmentId: string | null | undefined;
  /**
   * The requested department (when `departmentId` is set and the program has no department of its
   * own). `null` = it does not exist.
   */
  department?: RuleDepartment | null;
}

/**
 * - the program must be ACTIVE when it is being assigned;
 * - the session must not be ARCHIVED when it is being assigned;
 * - if the program belongs to a department, the registration's department must be that department
 *   (it is filled in automatically when omitted); otherwise any ACTIVE department (or none) is allowed.
 */
export function checkRegistrationRelations(
  input: RegistrationRelationInput,
  assigning: { program: boolean; session: boolean; department: boolean },
): RegistrationRelationResult {
  const { program, session } = input;
  if (assigning.program && program.status !== 'ACTIVE') {
    return issue(
      'program',
      'INACTIVE_PROGRAM',
      'This program is inactive. Choose an active program.',
    );
  }
  if (assigning.session && session.status === 'ARCHIVED') {
    return issue(
      'academicSession',
      'ARCHIVED_SESSION',
      'This academic session is archived. Choose another session.',
    );
  }

  let departmentId: string | null;
  if (program.department) {
    if (input.departmentId && input.departmentId !== program.department.id) {
      return issue(
        'department',
        'PROGRAM_DEPARTMENT_MISMATCH',
        `Program ${program.code} belongs to department ${program.department.code}. Choose that department or leave it empty.`,
      );
    }
    departmentId = program.department.id;
  } else if (input.departmentId) {
    const department = input.department;
    if (!department) {
      return issue('department', 'UNKNOWN_DEPARTMENT', 'Choose an existing department.');
    }
    if (assigning.department && department.status !== 'ACTIVE') {
      return issue(
        'department',
        'INACTIVE_DEPARTMENT',
        'This department is inactive. Choose an active department.',
      );
    }
    departmentId = department.id;
  } else {
    departmentId = null;
  }
  return { ok: true, programId: program.id, academicSessionId: session.id, departmentId };
}

function issue(
  field: RegistrationRelationIssue['field'],
  code: RegistrationRelationIssueCode,
  message: string,
): RegistrationRelationResult {
  return { ok: false, issue: { field, code, message } };
}
