/** Audit action names written to `audit_logs.action`. Add new actions here, never inline strings. */
export const AUDIT_ACTIONS = {
  authLoginSuccess: 'AUTH_LOGIN_SUCCESS',
  authLoginFailure: 'AUTH_LOGIN_FAILURE',
  authLogout: 'AUTH_LOGOUT',
  authSessionRevoked: 'AUTH_SESSION_REVOKED',
  authPasswordChanged: 'AUTH_PASSWORD_CHANGED',
  authPasswordResetRequested: 'AUTH_PASSWORD_RESET_REQUESTED',
  authPasswordReset: 'AUTH_PASSWORD_RESET',
  userDisabled: 'USER_DISABLED',
  adminCreated: 'ADMIN_CREATED',
  departmentCreated: 'DEPARTMENT_CREATED',
  departmentUpdated: 'DEPARTMENT_UPDATED',
  departmentStatusChanged: 'DEPARTMENT_STATUS_CHANGED',
  programCreated: 'PROGRAM_CREATED',
  programUpdated: 'PROGRAM_UPDATED',
  programStatusChanged: 'PROGRAM_STATUS_CHANGED',
  academicSessionCreated: 'ACADEMIC_SESSION_CREATED',
  academicSessionUpdated: 'ACADEMIC_SESSION_UPDATED',
  academicSessionStatusChanged: 'ACADEMIC_SESSION_STATUS_CHANGED',
  studentCreated: 'STUDENT_CREATED',
  studentUpdated: 'STUDENT_UPDATED',
  registrationCreated: 'REGISTRATION_CREATED',
  registrationUpdated: 'REGISTRATION_UPDATED',
  registrationStatusChanged: 'REGISTRATION_STATUS_CHANGED',
  studentImportCreated: 'STUDENT_IMPORT_CREATED',
  studentImportUploaded: 'STUDENT_IMPORT_UPLOADED',
  studentImportMappingSaved: 'STUDENT_IMPORT_MAPPING_SAVED',
  studentImportValidated: 'STUDENT_IMPORT_VALIDATED',
  studentImportCommitRequested: 'STUDENT_IMPORT_COMMIT_REQUESTED',
  studentImportCommitted: 'STUDENT_IMPORT_COMMITTED',
  studentImportCancelled: 'STUDENT_IMPORT_CANCELLED',
  studentImportFailed: 'STUDENT_IMPORT_FAILED',
  studentImportRetried: 'STUDENT_IMPORT_RETRIED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Audit actions about academic records (shown in dashboard / record activity; auth events are not). */
export const ACADEMIC_AUDIT_ACTIONS: readonly AuditAction[] = [
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'DEPARTMENT_STATUS_CHANGED',
  'PROGRAM_CREATED',
  'PROGRAM_UPDATED',
  'PROGRAM_STATUS_CHANGED',
  'ACADEMIC_SESSION_CREATED',
  'ACADEMIC_SESSION_UPDATED',
  'ACADEMIC_SESSION_STATUS_CHANGED',
  'STUDENT_CREATED',
  'STUDENT_UPDATED',
  'REGISTRATION_CREATED',
  'REGISTRATION_UPDATED',
  'REGISTRATION_STATUS_CHANGED',
  'STUDENT_IMPORT_COMMITTED',
];

/** Audit actions about import jobs (metadata holds the import ID and counts — never row content). */
export const IMPORT_AUDIT_ACTIONS: readonly AuditAction[] = [
  'STUDENT_IMPORT_CREATED',
  'STUDENT_IMPORT_UPLOADED',
  'STUDENT_IMPORT_MAPPING_SAVED',
  'STUDENT_IMPORT_VALIDATED',
  'STUDENT_IMPORT_COMMIT_REQUESTED',
  'STUDENT_IMPORT_COMMITTED',
  'STUDENT_IMPORT_CANCELLED',
  'STUDENT_IMPORT_FAILED',
  'STUDENT_IMPORT_RETRIED',
];
