import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@docversity/validation';

export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * The one exception type application code throws. The global filter turns it into the standard
 * `{ error: { code, message, requestId } }` body. `message` must always be safe to show to users.
 */
export class AppError extends Error {
  constructor(
    readonly status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly options: { details?: ErrorDetail[]; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (details: ErrorDetail[]) =>
    new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.validationFailed, 'The request is invalid.', {
      details,
    }),
  authRequired: () =>
    new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.authRequired, 'Sign in to continue.'),
  sessionExpired: () =>
    new AppError(
      HttpStatus.UNAUTHORIZED,
      ERROR_CODES.authSessionExpired,
      'Your session has ended. Sign in again.',
    ),
  invalidCredentials: () =>
    new AppError(
      HttpStatus.UNAUTHORIZED,
      ERROR_CODES.authInvalidCredentials,
      'Unable to sign in with those credentials.',
    ),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      ERROR_CODES.authRateLimited,
      'Too many sign-in attempts. Please wait and try again.',
      { headers: { 'Retry-After': String(Math.max(1, retryAfterSeconds)) } },
    ),
  authUnavailable: () =>
    new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      ERROR_CODES.authUnavailable,
      'Sign-in is temporarily unavailable. Please try again shortly.',
    ),
  csrf: () =>
    new AppError(
      HttpStatus.FORBIDDEN,
      ERROR_CODES.csrfInvalid,
      'The request could not be verified.',
    ),
  originNotAllowed: () =>
    new AppError(
      HttpStatus.FORBIDDEN,
      ERROR_CODES.originNotAllowed,
      'The request could not be verified.',
    ),
  forbidden: () =>
    new AppError(
      HttpStatus.FORBIDDEN,
      ERROR_CODES.forbidden,
      'You do not have permission to do that.',
    ),
  notFound: () => new AppError(HttpStatus.NOT_FOUND, ERROR_CODES.notFound, 'Not found.'),
};
