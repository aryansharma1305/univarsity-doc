import type { StaffNextStep } from '@docversity/validation';

/**
 * Where a restricted staff session has to go. UX only: the API refuses every other staff route
 * (403 PASSWORD_CHANGE_REQUIRED / MFA_REQUIRED / MFA_ENROLLMENT_REQUIRED) regardless.
 */
export const STEP_PATHS = {
  MFA_VERIFY: '/admin/login/verify',
  PASSWORD_CHANGE: '/admin/security/password',
  MFA_ENROLL: '/admin/security/mfa',
} as const satisfies Record<StaffNextStep, string>;

export type StepPath = (typeof STEP_PATHS)[StaffNextStep];

export function pathAfterSignIn(step: StaffNextStep | null | undefined): StepPath | '/admin' {
  return step ? STEP_PATHS[step] : '/admin';
}

/** API error codes that mean "this session must finish a step first". */
export const STEP_ERROR_CODES: Readonly<Record<string, StaffNextStep>> = {
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE',
  MFA_REQUIRED: 'MFA_VERIFY',
  MFA_ENROLLMENT_REQUIRED: 'MFA_ENROLL',
};
