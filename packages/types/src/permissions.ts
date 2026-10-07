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
  studentsRead: 'students.read',
  studentsWrite: 'students.write',
  resultsRead: 'results.read',
  resultsWrite: 'results.write',
  resultsPublish: 'results.publish',
  certificatesRead: 'certificates.read',
  certificatesGenerate: 'certificates.generate',
  certificatesApprove: 'certificates.approve',
  certificatesIssue: 'certificates.issue',
  certificatesRevoke: 'certificates.revoke',
  templatesRead: 'templates.read',
  templatesWrite: 'templates.write',
  importsRun: 'imports.run',
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

/** Read-only access shared by every staff role. */
const READ_ONLY: readonly Permission[] = [
  P.studentsRead,
  P.resultsRead,
  P.certificatesRead,
  P.templatesRead,
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleName, readonly Permission[]>> = Object.freeze({
  /** Everything, including user and settings management. */
  SUPER_ADMIN: ALL_PERMISSIONS,
  /** Owns student records and imports; prepares (but cannot approve/issue) certificates. */
  REGISTRAR: [...READ_ONLY, P.studentsWrite, P.importsRun, P.certificatesGenerate, P.auditRead],
  /** Prepares results and runs result imports; cannot publish (maker–checker). */
  EXAM_ADMIN: [...READ_ONLY, P.resultsWrite, P.importsRun],
  /** Prepares certificates and maintains templates; cannot approve/issue (maker–checker). */
  CERTIFICATE_ADMIN: [...READ_ONLY, P.certificatesGenerate, P.templatesWrite],
  /** The "checker": publishes results and approves/issues/revokes certificates; edits nothing. */
  APPROVER: [
    ...READ_ONLY,
    P.resultsPublish,
    P.certificatesApprove,
    P.certificatesIssue,
    P.certificatesRevoke,
  ],
  /** Read-only. */
  VIEWER: READ_ONLY,
});

export const ROLE_DESCRIPTIONS: Readonly<Record<RoleName, string>> = Object.freeze({
  SUPER_ADMIN: 'Full access, including user and settings management.',
  REGISTRAR: 'Manages student records and imports; prepares certificates.',
  EXAM_ADMIN: 'Prepares examination results and runs result imports.',
  CERTIFICATE_ADMIN: 'Prepares certificates and maintains document templates.',
  APPROVER: 'Publishes results and approves, issues or revokes certificates.',
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
