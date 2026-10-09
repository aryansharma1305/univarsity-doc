import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ERROR_CODES, PAYMENT_EVIDENCE_RULES, PAYMENT_QR_RULES } from '@docversity/validation';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { AppError, Errors } from '../common/app-error.js';

export interface UploadedPaymentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type PaymentUploadRequest = Request & { file?: UploadedPaymentFile };

/**
 * Reads at most one file (in `field`) and a few short text fields into memory with hard limits.
 * Interceptors run after the global guards, so the session, CSRF token and permission (or student
 * principal) are verified before any byte of the upload is buffered. Nothing is written to disk.
 */
async function readMultipart(
  context: ExecutionContext,
  field: string,
  maxBytes: number,
  textFields: number,
  label: string,
): Promise<void> {
  const http = context.switchToHttp();
  const request = http.getRequest<PaymentUploadRequest>();
  const response = http.getResponse<Response>();
  if (!request.is('multipart/form-data')) {
    throw Errors.validation([{ path: field, message: 'Send the request as multipart/form-data.' }]);
  }
  const maxMb = maxBytes / (1024 * 1024);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: textFields,
      parts: textFields + 1,
      fieldSize: 1_024,
      headerPairs: 50,
    },
  }).single(field);
  await new Promise<void>((resolve, reject) => {
    upload(request, response, (error: unknown) => {
      if (!error) {
        resolve();
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        reject(
          new AppError(
            HttpStatus.PAYLOAD_TOO_LARGE,
            ERROR_CODES.fileTooLarge,
            `The ${label} is larger than ${String(maxMb)} MB.`,
            { details: [{ path: field, message: `Maximum size is ${String(maxMb)} MB.` }] },
          ),
        );
        return;
      }
      reject(
        Errors.validation([
          { path: field, message: `Upload at most one ${label} in the "${field}" field.` },
        ]),
      );
    });
  });
}

/** Staff: one QR image in `file` (no other fields). */
@Injectable()
export class QrUploadInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    await readMultipart(context, 'file', PAYMENT_QR_RULES.maxBytes, 0, 'QR image');
    return next.handle();
  }
}

/** Student: `transactionReference` plus an optional receipt in `evidence`. */
@Injectable()
export class EvidenceUploadInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    await readMultipart(context, 'evidence', PAYMENT_EVIDENCE_RULES.maxBytes, 1, 'receipt');
    return next.handle();
  }
}
