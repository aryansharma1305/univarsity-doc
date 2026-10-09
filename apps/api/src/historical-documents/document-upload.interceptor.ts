import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ERROR_CODES, HISTORICAL_DOCUMENT_RULES } from '@docversity/validation';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { AppError, Errors } from '../common/app-error.js';

export interface UploadedDocument {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type DocumentUploadRequest = Request & { file?: UploadedDocument };

const MAX_MB = HISTORICAL_DOCUMENT_RULES.maxBytes / (1024 * 1024);

/**
 * Reads one document (`file`) plus a small number of text fields into memory with hard limits.
 * Interceptors run after the global guards: the staff session, CSRF token and permission are
 * verified before any byte of the upload is buffered. Nothing is written to disk.
 */
@Injectable()
export class DocumentUploadInterceptor implements NestInterceptor {
  private readonly upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: HISTORICAL_DOCUMENT_RULES.maxBytes,
      files: 1,
      fields: 12,
      parts: 13,
      fieldSize: 2_048,
      headerPairs: 50,
    },
  }).single('file');

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<DocumentUploadRequest>();
    const response = http.getResponse<Response>();
    if (!request.is('multipart/form-data')) {
      throw Errors.validation([
        { path: 'file', message: 'Send the upload as multipart/form-data.' },
      ]);
    }
    await new Promise<void>((resolve, reject) => {
      this.upload(request, response, (error: unknown) => {
        if (!error) {
          resolve();
          return;
        }
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          reject(
            new AppError(
              HttpStatus.PAYLOAD_TOO_LARGE,
              ERROR_CODES.fileTooLarge,
              `The document is larger than ${String(MAX_MB)} MB.`,
              { details: [{ path: 'file', message: `Maximum size is ${String(MAX_MB)} MB.` }] },
            ),
          );
          return;
        }
        reject(
          Errors.validation([
            { path: 'file', message: 'Upload exactly one document in the "file" field.' },
          ]),
        );
      });
    });
    return next.handle();
  }
}
