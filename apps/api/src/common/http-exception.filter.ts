import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { domainGuardName, isDomainIntegrityViolation, prismaErrorCode } from '@docversity/database';
import { ERROR_CODES, type ErrorCode, type ErrorResponse } from '@docversity/validation';
import type { Response } from 'express';
import { AppError, type ErrorDetail } from './app-error.js';
import { currentRequestId } from './request-context.js';

interface Translated {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
  headers?: Record<string, string>;
}

/**
 * Converts every error into the standard error body. Database and internal details are logged
 * server-side and never returned. DV001 (integrity triggers) becomes 409 Conflict.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const translated = this.translate(exception);
    const body: ErrorResponse = {
      error: {
        code: translated.code,
        message: translated.message,
        requestId: currentRequestId() ?? 'unknown',
        ...(translated.details ? { details: translated.details } : {}),
      },
    };
    for (const [name, value] of Object.entries(translated.headers ?? {})) {
      response.setHeader(name, value);
    }
    response.status(translated.status).json(body);
  }

  translate(exception: unknown): Translated {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        ...(exception.options.details ? { details: exception.options.details } : {}),
        ...(exception.options.headers ? { headers: exception.options.headers } : {}),
      };
    }

    if (isDomainIntegrityViolation(exception)) {
      this.logger.warn({
        msg: 'Domain integrity guard rejected an operation',
        guard: domainGuardName(exception),
      });
      return {
        status: HttpStatus.CONFLICT,
        code: ERROR_CODES.domainIntegrityViolation,
        message: 'This change is not allowed for the record in its current state.',
      };
    }

    switch (prismaErrorCode(exception)) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.uniqueConstraintViolation,
          message: 'A record with the same identifier already exists.',
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.referenceConstraintViolation,
          message: 'This record is referenced by other records or refers to a missing record.',
        };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: ERROR_CODES.notFound, message: 'Not found.' };
      default:
        break;
    }

    if (exception instanceof NotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: ERROR_CODES.notFound, message: 'Not found.' };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < 500) {
        return { status, code: ERROR_CODES.validationFailed, message: 'The request is invalid.' };
      }
    }

    // Express/body-parser errors (malformed JSON, payload too large) carry a 4xx `status`.
    const status = (exception as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return { status, code: ERROR_CODES.validationFailed, message: 'The request is invalid.' };
    }

    this.logger.error({ msg: 'Unhandled error', err: exception });
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.internalError,
      message: 'Something went wrong. Please try again.',
    };
  }
}
