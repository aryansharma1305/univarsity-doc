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
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
