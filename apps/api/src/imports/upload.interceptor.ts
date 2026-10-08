import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ERROR_CODES } from '@docversity/validation';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { AppError, Errors } from '../common/app-error.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

export interface UploadedWorkbook {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type UploadRequest = Request & { file?: UploadedWorkbook };

/**
 * Reads ONE multipart file field ("file") into memory with hard limits from configuration
 * (IMPORT_MAX_FILE_MB). Interceptors run after the global guards, so authentication, CSRF/origin
 * and permission checks happen before a single byte of the upload is buffered. Nothing is written
 * to disk; the original filename is only ever used as display metadata.
 */
@Injectable()
export class WorkbookUploadInterceptor implements NestInterceptor {
  private readonly upload: ReturnType<multer.Multer['single']>;
  private readonly maxMb: number;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.maxMb = config.IMPORT_MAX_FILE_MB;
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: config.IMPORT_MAX_FILE_MB * 1024 * 1024,
        files: 1,
        fields: 5,
        parts: 6,
        fieldSize: 1_024,
        headerPairs: 50,
      },
    }).single('file');
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<UploadRequest>();
    const response = http.getResponse<Response>();
    if (!request.is('multipart/form-data')) {
      throw Errors.validation([
        { path: 'file', message: 'Upload the workbook as multipart/form-data.' },
      ]);
    }
    await new Promise<void>((resolve, reject) => {
      this.upload(request, response, (error: unknown) => {
        if (!error) {
          resolve();
          return;
        }
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            reject(
              new AppError(
                HttpStatus.PAYLOAD_TOO_LARGE,
                ERROR_CODES.fileTooLarge,
                `The file is larger than ${this.maxMb} MB. Split it into smaller files.`,
                { details: [{ path: 'file', message: `Maximum size is ${this.maxMb} MB.` }] },
              ),
            );
            return;
          }
          reject(
            Errors.validation([
              { path: 'file', message: 'Upload exactly one file in the "file" field.' },
            ]),
          );
          return;
        }
        reject(Errors.validation([{ path: 'file', message: 'The upload could not be read.' }]));
      });
    });
    return next.handle();
  }
}
