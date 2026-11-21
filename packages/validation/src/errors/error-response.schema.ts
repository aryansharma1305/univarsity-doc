import { z } from 'zod';

/** Every API error has this shape. `requestId` matches the X-Request-Id response header. */
export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ description: 'Stable, machine-readable error code.' }),
      message: z.string().meta({ description: 'Safe, user-facing message.' }),
      requestId: z.string(),
      details: z
        .array(z.object({ path: z.string(), message: z.string() }))
        .optional()
        .meta({ description: 'Field-level validation problems (validation errors only).' }),
    }),
  })
  .meta({ id: 'ErrorResponse' });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const ERROR_CODES = {
  publicVerificationUnavailable: 'PUBLIC_VERIFICATION_UNAVAILABLE',
  publicVerificationRateLimited: 'PUBLIC_VERIFICATION_RATE_LIMITED',
  validationFailed: 'VALIDATION_FAILED',
  authRequired: 'AUTH_REQUIRED',
  authInvalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  authSessionExpired: 'AUTH_SESSION_EXPIRED',
  authRateLimited: 'AUTH_RATE_LIMITED',
  authUnavailable: 'AUTH_SERVICE_UNAVAILABLE',
  authInvalidResetToken: 'AUTH_INVALID_RESET_TOKEN',
  authPasswordPolicy: 'AUTH_PASSWORD_POLICY',
  /** Staff session restricted until the password is changed (first login or access reset). */
  passwordChangeRequired: 'PASSWORD_CHANGE_REQUIRED',
  /** Password accepted; the session can only complete the authenticator (MFA) step. */
  mfaRequired: 'MFA_REQUIRED',
  /** MFA is enforced for staff and this account has not enrolled an authenticator yet. */
  mfaEnrollmentRequired: 'MFA_ENROLLMENT_REQUIRED',
  mfaInvalidCode: 'MFA_INVALID_CODE',
  mfaAlreadyEnabled: 'MFA_ALREADY_ENABLED',
  mfaEnrollmentExpired: 'MFA_ENROLLMENT_EXPIRED',
  /** Too many wrong codes: verification is locked until the cool-down ends or an access reset. */
  mfaLocked: 'MFA_LOCKED',
  /** The server has no MFA encryption key configured (development only; production refuses to start). */
  mfaUnavailable: 'MFA_UNAVAILABLE',
  studentActivationFailed: 'STUDENT_ACTIVATION_FAILED',
  passwordResetUnavailable: 'PASSWORD_RESET_UNAVAILABLE',
  csrfInvalid: 'CSRF_INVALID',
  originNotAllowed: 'ORIGIN_NOT_ALLOWED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  /** The payment provider could not be reached or refused the request; nothing was charged. */
  paymentProviderUnavailable: 'PAYMENT_PROVIDER_UNAVAILABLE',
  documentNotEditable: 'DOCUMENT_NOT_EDITABLE',
  documentNotReady: 'DOCUMENT_NOT_READY',
  curriculumNotEditable: 'CURRICULUM_NOT_EDITABLE',
  curriculumOverlap: 'CURRICULUM_OVERLAP',
  profileRequestPending: 'PROFILE_REQUEST_PENDING',
  profileRequestNotPending: 'PROFILE_REQUEST_NOT_PENDING',
  profileRequestStale: 'PROFILE_REQUEST_STALE',
  profileRequestNoChanges: 'PROFILE_REQUEST_NO_CHANGES',
  fileTooLarge: 'FILE_TOO_LARGE',
  unsupportedFile: 'UNSUPPORTED_FILE',
  serviceUnavailable: 'SERVICE_UNAVAILABLE',
  domainIntegrityViolation: 'DOMAIN_INTEGRITY_VIOLATION',
  uniqueConstraintViolation: 'UNIQUE_CONSTRAINT_VIOLATION',
  referenceConstraintViolation: 'REFERENCE_CONSTRAINT_VIOLATION',
  internalError: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
