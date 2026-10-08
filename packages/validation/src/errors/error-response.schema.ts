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
  validationFailed: 'VALIDATION_FAILED',
  authRequired: 'AUTH_REQUIRED',
  authInvalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  authSessionExpired: 'AUTH_SESSION_EXPIRED',
  authRateLimited: 'AUTH_RATE_LIMITED',
  authUnavailable: 'AUTH_SERVICE_UNAVAILABLE',
  authInvalidResetToken: 'AUTH_INVALID_RESET_TOKEN',
  authPasswordPolicy: 'AUTH_PASSWORD_POLICY',
  studentActivationFailed: 'STUDENT_ACTIVATION_FAILED',
  passwordResetUnavailable: 'PASSWORD_RESET_UNAVAILABLE',
  csrfInvalid: 'CSRF_INVALID',
  originNotAllowed: 'ORIGIN_NOT_ALLOWED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
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
