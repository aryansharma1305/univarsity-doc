/**
 * Authorization model.
 *
 * - Roles are DATABASE records (`roles` table) so they can be assigned without a deploy.
 * - Permissions are CODE constants (this file). A role grants permissions only through
 *   ROLE_PERMISSIONS; a role name with no entry here grants nothing.
 * - Backend guards are authoritative. The web app may use the same constants only to hide
 *   controls a user cannot use.
 *
 * Phase 3 defines the framework. The feature endpoints that need these permissions arrive in
 * later phases; the role → permission mapping below is the initial proposal pending client sign-off
 * (see docs/architecture/authorization.md).
 */
export const PERMISSIONS = {
  departmentsRead: 'departments.read',
  departmentsWrite: 'departments.write',
  programsRead: 'programs.read',
  programsWrite: 'programs.write',
  academicSessionsRead: 'academicSessions.read',
  academicSessionsWrite: 'academicSessions.write',
  studentsRead: 'students.read',
  studentsWrite: 'students.write',
  registrationsRead: 'registrations.read',
  registrationsWrite: 'registrations.write',
  /** Subject catalogue (Phase 7B). */
  subjectsRead: 'subjects.read',
  subjectsWrite: 'subjects.write',
  /** Curriculum versions and their subject assignments (Phase 7B). */
  curriculaRead: 'curricula.read',
  /** Create/edit DRAFT curriculum versions and their subject assignments. */
  curriculaWrite: 'curricula.write',
  /** Activate a DRAFT curriculum version (makes it assignable and read-only). */
  curriculaActivate: 'curricula.activate',
  /** Archive a curriculum version (no new assignments; history stays readable). */
  curriculaArchive: 'curricula.archive',
  /** Assign registrations to an ACTIVE curriculum version of their program. */
  studentCurriculaAssign: 'studentCurricula.assign',
  resultsRead: 'results.read',
  resultsWrite: 'results.write',
  resultsPublish: 'results.publish',
  certificatesRead: 'certificates.read',
  certificatesGenerate: 'certificates.generate',
  certificatesApprove: 'certificates.approve',
  certificatesIssue: 'certificates.issue',
  certificatesRevoke: 'certificates.revoke',
  /** Historical documents (Phase 8): list, view and download staff-uploaded certificates. */
  historicalDocumentsRead: 'historicalDocuments.read',
  /** Upload historical documents, edit drafts and prepare replacements. */
  historicalDocumentsUpload: 'historicalDocuments.upload',
  /** Publish to (or withdraw from) the student's document library. */
  historicalDocumentsPublish: 'historicalDocuments.publish',
  /** Record the official authenticity review (never by the uploader). */
  historicalDocumentsVerify: 'historicalDocuments.verify',
  /** Examination records and the external examination application links (Phase 9A). */
  examinationsRead: 'examinations.read',
  /** Configure external examination application links; create/open/archive examination records. */
  examinationsManage: 'examinations.manage',
  /** Re-exam applications (Phase 9B): list, view and export (personal data — not for VIEWER). */
  reExamApplicationsRead: 'reExamApplications.read',
  /** Approve or reject re-exam applications (never implied by payment). */
  reExamApplicationsDecide: 'reExamApplications.decide',
  /** Create and activate versioned re-exam fee rules (finance policy; SUPER_ADMIN until agreed). */
  reExamFeesManage: 'reExamFees.manage',
  /**
   * Re-exam payment destinations (Phase 9C): beneficiary, currency, amounts, QR and validity per
   * country/region. Approval needs a second person with this permission (maker–checker).
   */
  reExamPaymentsConfigure: 'reExamPayments.configure',
  /** Submitted re-exam payments and their evidence (financial and personal data). */
  reExamPaymentsRead: 'reExamPayments.read',
  /** Confirm or reject a submitted payment after checking the university's own account. */
  reExamPaymentsVerify: 'reExamPayments.verify',
  templatesRead: 'templates.read',
  templatesWrite: 'templates.write',
  /** Import history, rows and error reports. */
  importsRead: 'imports.read',
  /** Run student / registration imports (Phase 5). */
  importsStudentsRun: 'imports.students.run',
  /** Run result imports. Phase 10B: results import PREVIEW only (nothing is saved). */
  importsResultsRun: 'imports.results.run',
  /** Student portal accounts: list registrations with their portal state (Phase 6). */
  studentAccountsRead: 'studentAccounts.read',
  /** Issue/revoke activation codes, lock/unlock/disable student accounts (Phase 6). */
  studentAccountsManage: 'studentAccounts.manage',
  /** Student profile change requests: list, compare and view staged photos (Phase 7). */
  studentProfileRequestsRead: 'studentProfileRequests.read',
  /** Approve or reject student profile change requests (Phase 7). */
  studentProfileRequestsReview: 'studentProfileRequests.review',
  auditRead: 'audit.read',
  usersManage: 'users.manage',
  settingsManage: 'settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(Object.values(PERMISSIONS));

export const ROLE_NAMES = {
  superAdmin: 'SUPER_ADMIN',
  registrar: 'REGISTRAR',
  examAdmin: 'EXAM_ADMIN',
  certificateAdmin: 'CERTIFICATE_ADMIN',
  approver: 'APPROVER',
  viewer: 'VIEWER',
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

const P = PERMISSIONS;

/** Read-only access shared by every staff role (academic masters, students, results, documents). */
const READ_ONLY: readonly Permission[] = [
  P.departmentsRead,
  P.programsRead,
  P.academicSessionsRead,
  P.studentsRead,
  P.registrationsRead,
  P.subjectsRead,
  P.curriculaRead,
  P.resultsRead,
  P.certificatesRead,
  P.templatesRead,
  P.examinationsRead,
];

/** Maintaining the academic masters and student records (Phase 4). */
const ACADEMIC_RECORDS_WRITE: readonly Permission[] = [
  P.departmentsWrite,
  P.programsWrite,
  P.academicSessionsWrite,
  P.studentsWrite,
  P.registrationsWrite,
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleName, readonly Permission[]>> = Object.freeze({
  /** Everything, including user and settings management. */
  SUPER_ADMIN: ALL_PERMISSIONS,
  /** Owns academic masters, student records and imports; prepares (cannot approve/issue) certificates. */
  REGISTRAR: [
    ...READ_ONLY,
    ...ACADEMIC_RECORDS_WRITE,
    P.importsRead,
    P.importsStudentsRun,
    P.studentAccountsRead,
    P.studentAccountsManage,
    P.studentProfileRequestsRead,
    P.studentProfileRequestsReview,
    P.subjectsWrite,
    P.curriculaWrite,
    P.curriculaActivate,
    P.curriculaArchive,
    P.studentCurriculaAssign,
    P.historicalDocumentsRead,
    P.historicalDocumentsUpload,
    P.historicalDocumentsPublish,
    P.historicalDocumentsVerify,
    P.certificatesGenerate,
    P.auditRead,
    P.reExamApplicationsRead,
  ],
  /**
   * Prepares results and will run result imports (Phase 8); cannot publish (maker–checker).
   * Student imports are deliberately NOT granted.
   */
  EXAM_ADMIN: [
    ...READ_ONLY,
    P.resultsWrite,
    P.importsResultsRun,
    P.examinationsManage,
    P.reExamApplicationsRead,
    P.reExamApplicationsDecide,
  ],
  /** Prepares certificates and maintains templates; cannot approve/issue (maker–checker). */
  CERTIFICATE_ADMIN: [
    ...READ_ONLY,
    P.certificatesGenerate,
    P.templatesWrite,
    P.historicalDocumentsRead,
    P.historicalDocumentsUpload,
  ],
  /** The "checker": publishes results and approves/issues/revokes certificates; edits nothing. */
  APPROVER: [
    ...READ_ONLY,
    P.resultsPublish,
    P.certificatesApprove,
    P.certificatesIssue,
    P.certificatesRevoke,
    P.historicalDocumentsRead,
    P.historicalDocumentsPublish,
    P.historicalDocumentsVerify,
    P.reExamApplicationsRead,
    P.reExamPaymentsRead,
    P.reExamPaymentsVerify,
  ],
  /** Read-only. */
  VIEWER: READ_ONLY,
});

export const ROLE_DESCRIPTIONS: Readonly<Record<RoleName, string>> = Object.freeze({
  SUPER_ADMIN: 'Full access, including user and settings management.',
  REGISTRAR: 'Manages student records and imports; prepares certificates.',
  EXAM_ADMIN:
    'Maintains examination records and the examination application links; prepares results.',
  CERTIFICATE_ADMIN: 'Prepares certificates and maintains document templates.',
  APPROVER:
    'Publishes results, approves, issues or revokes certificates, and verifies re-exam payments.',
  VIEWER: 'Read-only access.',
});

export function isRoleName(value: string): value is RoleName {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value);
}

/** Union of the permissions granted by the given role names. Unknown role names grant nothing. */
export function permissionsForRoles(roleNames: Iterable<string>): Set<Permission> {
  const granted = new Set<Permission>();
  for (const name of roleNames) {
    if (isRoleName(name)) {
      for (const permission of ROLE_PERMISSIONS[name]) granted.add(permission);
    }
  }
  return granted;
}
